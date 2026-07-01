import { describe, it, expect } from "vitest";
import { cosineSimilarity, createMemoryVectorStore } from "../lib/vectorStores";

describe("Vector Stores", () => {
  describe("cosineSimilarity", () => {
    it("should compute exact similarities for identical vectors", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });

    it("should compute zero similarity for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it("should compute negative similarities for opposite vectors", () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });
  });

  describe("createMemoryVectorStore", () => {
    const docs = [
      { content: "React is a UI framework.", embedding: [1, 0, 0], metadata: { title: "React" } },
      { content: "Node.js is a runtime.", embedding: [0, 1, 0], metadata: { title: "Node" } },
    ];

    it("should filter documents below similarity threshold", async () => {
      const store = createMemoryVectorStore(docs);
      const query = [1, 0, 0]; // Query matches React only
      const results = await store(query, { matchCount: 5, matchThreshold: 0.8 });
      expect(results).toHaveLength(1);
      expect(results[0].metadata.title).toBe("React");
    });

    it("should limit results to matchCount", async () => {
      const store = createMemoryVectorStore(docs);
      const query = [1, 1, 0]; // Matches both
      const results = await store(query, { matchCount: 1, matchThreshold: 0.1 });
      expect(results).toHaveLength(1);
    });
  });
});
