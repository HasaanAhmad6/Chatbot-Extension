import type { DocumentChunk, VectorStoreAdapter } from "../types";

function dotProduct(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function magnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/**
 * Creates an in-memory vector store adapter from a static list of documents.
 * Extremely useful for testing, local offline usage, or client-side mock RAG.
 */
export function createMemoryVectorStore(
  documents: Array<{ content: string; embedding: number[]; metadata?: Record<string, any> }>
): VectorStoreAdapter {
  return async (embedding: number[], options) => {
    const results = documents
      .map((doc, index) => {
        const similarity = cosineSimilarity(embedding, doc.embedding);
        return {
          id: String(index),
          content: doc.content,
          metadata: doc.metadata || {},
          similarity,
        };
      })
      .filter((doc) => doc.similarity >= options.matchThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.matchCount);

    return results;
  };
}

/**
 * Creates a vector store adapter that queries a Supabase vector DB matching documents index.
 * Relies on the database having pgvector enabled and a match_documents RPC function.
 */
export function createSupabaseVectorStore(
  supabaseUrl: string,
  supabaseAnonKey: string
): VectorStoreAdapter {
  return async (embedding: number[], options) => {
    const url = `${supabaseUrl}/rest/v1/rpc/match_documents`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: options.matchCount,
        match_threshold: options.matchThreshold,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase search failed: ${response.statusText}`);
    }

    return response.json();
  };
}
