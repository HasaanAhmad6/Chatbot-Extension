import type { ConversationTurn, EmbeddingAdapter, LLMAdapter, LLMStreamAdapter } from "./adapters";
import type { DocumentChunk, RagPipelineConfig, RagPipelineResult, VectorStoreAdapter, RagPipelineStreamConfig } from "../types";

export type { ConversationTurn, DocumentChunk, RagPipelineConfig, RagPipelineResult, VectorStoreAdapter, RagPipelineStreamConfig };

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
  return HANDOFF_PHRASES.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(lower);
  });
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
  const chunks = await vectorStore(embedding, { matchCount, matchThreshold, question });

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

function createStreamTransformer(
  sources: Array<{ title: string; url?: string; similarity: number }>,
  needsHumanHandoffDefault: boolean
): TransformStream<string, Uint8Array> {
  let buffer = "";
  let inSuggestions = false;
  let suggestionsBuffer = "";
  let answerAccumulator = "";
  const encoder = new TextEncoder();

  return new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      if (inSuggestions) {
        suggestionsBuffer += chunk;
      } else {
        buffer += chunk;
        const index = buffer.indexOf("<suggestions>");
        if (index !== -1) {
          inSuggestions = true;
          const preText = buffer.slice(0, index);
          if (preText) {
            answerAccumulator += preText;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "token", content: preText })}\n`)
            );
          }
          suggestionsBuffer = buffer.slice(index + "<suggestions>".length);
          buffer = "";
        } else {
          if (buffer.length > 20) {
            const releaseCount = buffer.length - 20;
            const releaseText = buffer.slice(0, releaseCount);
            buffer = buffer.slice(releaseCount);
            answerAccumulator += releaseText;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "token", content: releaseText })}\n`)
            );
          }
        }
      }
    },
    flush(controller) {
      if (!inSuggestions && buffer) {
        answerAccumulator += buffer;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "token", content: buffer })}\n`)
        );
      }

      let suggestedQuestions: string[] = [];
      const suggestionsMatch = suggestionsBuffer.match(/([\s\S]*?)<\/suggestions>/i);
      const textToParse = suggestionsMatch ? suggestionsMatch[1] : suggestionsBuffer;
      const suggestMatches = textToParse.match(/<suggest>([\s\S]*?)<\/suggest>/gi);
      if (suggestMatches) {
        suggestedQuestions = suggestMatches.map((m) =>
          m.replace(/<\/?suggest>/gi, "").trim()
        );
      }

      const isHandoff = needsHumanHandoffDefault || detectHandoff(answerAccumulator) || !answerAccumulator.trim();

      const metadata = {
        type: "metadata",
        sources,
        needsHumanHandoff: isHandoff,
        suggestedQuestions: suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
      };

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(metadata)}\n`)
      );
    }
  });
}

export async function runRagPipelineStream(
  question: string,
  conversation: ConversationTurn[],
  config: RagPipelineStreamConfig
): Promise<ReadableStream<Uint8Array>> {
  const {
    embeddingAdapter,
    llmStreamAdapter,
    vectorStore,
    matchCount = 8,
    matchThreshold = 0.5,
    conversationWindow = 6,
  } = config;

  const embedding = await embeddingAdapter(question);
  const chunks = await vectorStore(embedding, { matchCount, matchThreshold, question });

  const sources = chunks.slice(0, 8).map((chunk) => ({
    title: chunk.metadata?.title ?? "Source",
    url: chunk.metadata?.url ?? undefined,
    similarity: chunk.similarity,
  }));

  if (chunks.length === 0) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        const metadata = {
          type: "metadata",
          sources: [],
          needsHumanHandoff: true,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n`));
        controller.close();
      }
    });
  }

  const systemPrompt = buildSystemPrompt(chunks);
  const recentConversation = conversation.slice(-conversationWindow);

  const rawStream = await llmStreamAdapter({
    question,
    context: chunks.map((chunk) => chunk.content).join("\n\n"),
    conversation: recentConversation,
    systemPrompt,
  });

  const transformer = createStreamTransformer(sources, false);
  return rawStream.pipeThrough(transformer);
}