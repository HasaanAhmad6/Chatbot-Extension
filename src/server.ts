// Server-side entrypoint for RAG pipeline, adapters, and Supabase database setups

export { runRagPipeline, runRagPipelineStream } from "./lib/ragPipeline";
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
  createOpenAICompatibleLLMStream,
  createOpenAILLMStream,
  createGeminiLLMStream,
} from "./lib/adapterFactories";

export {
  createSupabaseVectorStore,
  createMemoryVectorStore,
  createChromeStorageVectorStore,
  cosineSimilarity,
} from "./lib/vectorStores";

export { chunkText } from "./lib/chunker";

export type {
  EmbeddingAdapter,
  LLMAdapter,
  LLMStreamAdapter,
  LLMAdapterInput,
  LLMAdapterOutput,
  ConversationTurn,
  RagPipelineConfig,
  RagPipelineStreamConfig,
  RagPipelineResult,
  DocumentChunk,
  VectorStoreAdapter,
} from "./types";
