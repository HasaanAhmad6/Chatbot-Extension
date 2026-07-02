import type { DocumentChunk, VectorStoreAdapter } from "../types";
import { fetchWithRetry } from "./utils";

const fetch = fetchWithRetry;

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
    let results = documents
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

    if (results.length === 0 && options.question) {
      const stopWords = new Set(["what", "is", "a", "the", "an", "who", "where", "how", "why", "about", "he", "his", "her", "of", "to", "in", "and", "or", "for", "with", "on", "at", "by", "from", "tell", "me", "show", "explain", "describe", "give", "us", "i"]);
      const queryWords = options.question
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stopWords.has(w));

      if (queryWords.length > 0) {
        results = documents
          .map((doc, index) => {
            const matches = queryWords.filter((w) => 
              new RegExp(`\\b${w}\\b`, "i").test(doc.content)
            ).length;
            return {
              id: String(index),
              content: doc.content,
              metadata: doc.metadata || {},
              similarity: options.matchThreshold + 0.1,
              matches,
            };
          })
          .filter((doc) => doc.matches > 0)
          .sort((a, b) => b.matches - a.matches)
          .map(({ matches, ...rest }) => rest)
          .slice(0, options.matchCount);
      }
    }

    return results;
  };
}


/**
 * Creates a vector store adapter that retrieves and queries document chunks
 * cached in chrome.storage.local for a specific domain.
 */
export function createChromeStorageVectorStore(domain: string): VectorStoreAdapter {
  return async (embedding: number[], options) => {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        console.warn("[createChromeStorageVectorStore] chrome.storage.local is not available.");
        resolve([]);
        return;
      }

      const storageKey = `index:${domain}`;
      chrome.storage.local.get([storageKey], (result: { [key: string]: any }) => {
        const stored = result[storageKey];
        if (!stored || !Array.isArray(stored.chunks)) {
          resolve([]);
          return;
        }

        const documents = stored.chunks as Array<{
          content: string;
          embedding: number[];
          metadata?: Record<string, any>;
        }>;

        let results = documents
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

        // Fallback keyword search
        if (results.length === 0 && options.question) {
          const stopWords = new Set(["what", "is", "a", "the", "an", "who", "where", "how", "why", "about", "he", "his", "her", "of", "to", "in", "and", "or", "for", "with", "on", "at", "by", "from", "tell", "me", "show", "explain", "describe", "give", "us", "i"]);
          const queryWords = options.question
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 1 && !stopWords.has(w));

          if (queryWords.length > 0) {
            results = documents
              .map((doc, index) => {
                const matches = queryWords.filter((w) => 
                  new RegExp(`\\b${w}\\b`, "i").test(doc.content)
                ).length;
                return {
                  id: String(index),
                  content: doc.content,
                  metadata: doc.metadata || {},
                  similarity: options.matchThreshold + 0.1,
                  matches,
                };
              })
              .filter((doc) => doc.matches > 0)
              .sort((a, b) => b.matches - a.matches)
              .map(({ matches, ...rest }) => rest)
              .slice(0, options.matchCount);
          }
        }

        resolve(results);
      });
    });
  };
}

