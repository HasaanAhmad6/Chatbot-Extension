/**
 * Provider-agnostic adapter contracts for the RAG pipeline.
 *
 * Users implement these functions with any provider they want.
 */

import type {
  EmbeddingAdapter,
  ConversationTurn,
  LLMAdapterInput,
  LLMAdapterOutput,
  LLMAdapter,
} from "../types";

export type {
  EmbeddingAdapter,
  ConversationTurn,
  LLMAdapterInput,
  LLMAdapterOutput,
  LLMAdapter,
};