// Server-side entrypoint for RAG pipeline, adapters, and Supabase database setups

export { runRagPipeline } from "./lib/ragPipeline";
export { ingestDocument, SUPABASE_SETUP_SQL } from "./lib/supabaseSetup";
export {
  createGeminiEmbeddingAdapter,
  createOpenAIEmbeddingAdapter,
  createCohereEmbeddingAdapter,
  createOpenAICompatibleLLMAdapter,
  createDeepSeekLLMAdapter,
  createOpenAILLMAdapter,
  createGroqLLMAdapter,
  createMistralLLMAdapter,
  createTogetherLLMAdapter,
  createOllamaLLMAdapter,
  createAnthropicLLMAdapter,
  createGeminiLLMAdapter,
} from "./lib/adapterFactories";

export type {
  EmbeddingAdapter,
  LLMAdapter,
  LLMAdapterInput,
  LLMAdapterOutput,
  ConversationTurn,
  RagPipelineConfig,
  RagPipelineResult,
  DocumentChunk,
} from "./types";
