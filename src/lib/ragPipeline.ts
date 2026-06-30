import type { ConversationTurn, EmbeddingAdapter, LLMAdapter } from "./adapters";

export type { ConversationTurn };

export type DocumentChunk = {
  id: string;
  content: string;
  metadata: {
    title?: string;
    url?: string;
    [key: string]: unknown;
  };
  similarity: number;
};

export type RagPipelineConfig = {
  embeddingAdapter: EmbeddingAdapter;
  llmAdapter: LLMAdapter;
  supabaseUrl: string;
  supabaseAnonKey: string;
  matchCount?: number;
  matchThreshold?: number;
  conversationWindow?: number;
};

export type RagPipelineResult = {
  answer: string;
  sources: Array<{ title: string; url?: string; similarity: number }>;
  needsHumanHandoff: boolean;
};

async function searchDocuments(
  embedding: number[],
  supabaseUrl: string,
  supabaseAnonKey: string,
  matchCount: number,
  matchThreshold: number
): Promise<DocumentChunk[]> {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/match_documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: matchCount,
      match_threshold: matchThreshold,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase vector search failed: ${response.status}`);
  }

  return (await response.json()) as DocumentChunk[];
}

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
    "You are a helpful assistant. Answer the user's question using ONLY the context provided below.",
    "If the context does not contain enough information to fully answer, clearly say so.",
    "Never make up or guess information that is not in the context.",
    "Be concise and direct.",
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
    supabaseUrl,
    supabaseAnonKey,
    matchCount = 8,
    matchThreshold = 0.5,
    conversationWindow = 6,
  } = config;

  const embedding = await embeddingAdapter(question);
  const chunks = await searchDocuments(embedding, supabaseUrl, supabaseAnonKey, matchCount, matchThreshold);

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

  return { answer: answer || "", sources, needsHumanHandoff };
}