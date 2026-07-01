import type { ConversationTurn, EmbeddingAdapter, LLMAdapter } from "./adapters";
import type { DocumentChunk, RagPipelineConfig, RagPipelineResult, VectorStoreAdapter } from "../types";

export type { ConversationTurn, DocumentChunk, RagPipelineConfig, RagPipelineResult, VectorStoreAdapter };

const HANDOFF_PHRASES = [
  "i don't have",
  "i do not have",
  "not in the context",
  "cannot find",
  "no information",
  "i'm not sure",
  "i am not sure",
  "outside my knowledge",
  "not available in",
  "unable to find",
];

function detectHandoff(answer: string): boolean {
  const lower = answer.toLowerCase();
  return HANDOFF_PHRASES.some((phrase) => lower.includes(phrase));
}

function buildSystemPrompt(chunks: DocumentChunk[]): string {
  const context = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.metadata?.title ?? "Source"}\n${chunk.content}`)
    .join("\n\n---\n\n");

  return [
    "You are a friendly, helpful AI portfolio assistant representing Hasaan. Answer the user's questions naturally, conversationally, and in the first person.",
    "Guidelines:",
    "1. Answer using the context provided below. Do NOT make up, guess, or hallucinate facts that are not present in the context.",
    "2. Avoid using robotic or clinical framing phrases. NEVER start answers with 'Based on the context...', 'According to the context...', 'The context states that...', or 'According to the provided text...'. Just speak naturally and directly.",
    "3. Respond to simple greetings, politeness, and general chit-chat (e.g. 'hello', 'hi', 'how are you', 'thank you') in a warm, welcoming manner without using context or referring to it.",
    "4. If the context does not contain enough information to answer a factual question about Hasaan, reply politely explaining that you do not have that specific information.",
    "5. After your response, you MUST generate 2 or 3 short, relevant follow-up questions that the user might want to ask next.",
    "   You MUST wrap these follow-up questions strictly in XML tags at the very end of your response like this:",
    "   <suggestions>",
    "     <suggest>What is Hasaan's experience in React?</suggest>",
    "     <suggest>Can you show me Hasaan's featured projects?</suggest>",
    "   </suggestions>",
    "   Ensure the questions are short, natural, and directly related to the user's query or your response.",
    "",
    "Context:",
    context,
  ].join("\n");
}

export async function runRagPipeline(
  question: string,
  conversation: ConversationTurn[],
  config: RagPipelineConfig
): Promise<RagPipelineResult> {
  const {
    embeddingAdapter,
    llmAdapter,
    vectorStore,
    matchCount = 8,
    matchThreshold = 0.5,
    conversationWindow = 6,
  } = config;

  const embedding = await embeddingAdapter(question);
  const chunks = await vectorStore(embedding, { matchCount, matchThreshold });

  if (chunks.length === 0) {
    return { answer: "", sources: [], needsHumanHandoff: true };
  }

  const systemPrompt = buildSystemPrompt(chunks);
  const recentConversation = conversation.slice(-conversationWindow);

  const { answer, needsHumanHandoff: adapterHandoff } = await llmAdapter({
    question,
    context: chunks.map((chunk) => chunk.content).join("\n\n"),
    conversation: recentConversation,
    systemPrompt,
  });

  const needsHumanHandoff = adapterHandoff ?? (detectHandoff(answer) || !answer);

  const sources = chunks.slice(0, 8).map((chunk) => ({
    title: chunk.metadata?.title ?? "Source",
    url: chunk.metadata?.url ?? undefined,
    similarity: chunk.similarity,
  }));

  let cleanAnswer = answer || "";
  let suggestedQuestions: string[] = [];

  const suggestionsMatch = cleanAnswer.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);
  if (suggestionsMatch) {
    const rawSuggestions = suggestionsMatch[1];
    cleanAnswer = cleanAnswer.replace(/<suggestions>[\s\S]*?<\/suggestions>/gi, "").trim();

    const suggestMatches = rawSuggestions.match(/<suggest>([\s\S]*?)<\/suggest>/gi);
    if (suggestMatches) {
      suggestedQuestions = suggestMatches.map((m) =>
        m.replace(/<\/?suggest>/gi, "").trim()
      );
    }
  }

  return {
    answer: cleanAnswer || "",
    sources,
    needsHumanHandoff,
    suggestedQuestions: suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
  };
}