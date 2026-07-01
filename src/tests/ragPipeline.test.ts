import { describe, it, expect } from "vitest";
import { runRagPipeline, runRagPipelineStream } from "../lib/ragPipeline";
import { createMemoryVectorStore } from "../lib/vectorStores";

describe("RAG Pipeline", () => {
  const documents = [
    { content: "Hasaan is a software engineer.", embedding: [1, 0, 0], metadata: { title: "Profile" } }
  ];
  const vectorStore = createMemoryVectorStore(documents);

  const mockEmbeddingAdapter = async () => [1, 0, 0];

  describe("runRagPipeline", () => {
    it("should process question and extract suggestions", async () => {
      const mockLLMAdapter = async () => ({
        answer: "Hasaan is a dev.\n<suggestions>\n  <suggest>What is his stack?</suggest>\n</suggestions>"
      });

      const result = await runRagPipeline("Who is Hasaan?", [], {
        embeddingAdapter: mockEmbeddingAdapter,
        llmAdapter: mockLLMAdapter,
        vectorStore,
      });

      expect(result.answer).toBe("Hasaan is a dev.");
      expect(result.suggestedQuestions).toEqual(["What is his stack?"]);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("Profile");
    });
  });

  describe("runRagPipelineStream", () => {
    it("should stream chunks and parse metadata at the end", async () => {
      const mockStreamAdapter = async () => {
        const chunks = [
          "Hasaan ",
          "is a dev. ",
          "<suggestions>",
          "  <suggest>What is his stack?</suggest>",
          "</suggestions>"
        ];
        return new ReadableStream({
          start(controller) {
            chunks.forEach((c) => controller.enqueue(c));
            controller.close();
          }
        });
      };

      const stream = await runRagPipelineStream("Who is Hasaan?", [], {
        embeddingAdapter: mockEmbeddingAdapter,
        llmStreamAdapter: mockStreamAdapter,
        vectorStore,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      let metadata = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const line = decoder.decode(value);
        if (line.startsWith("data: ")) {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === "token") {
            answer += parsed.content;
          } else if (parsed.type === "metadata") {
            metadata = parsed;
          }
        }
      }

      expect(answer.trim()).toBe("Hasaan is a dev.");
      expect(metadata).toBeDefined();
      expect(metadata.suggestedQuestions).toEqual(["What is his stack?"]);
      expect(metadata.sources[0].title).toBe("Profile");
    });
  });
});
