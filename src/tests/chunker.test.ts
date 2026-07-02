import { describe, it, expect } from "vitest";
import { chunkText } from "../lib/chunker";

describe("Text Chunker", () => {
  it("should return a single chunk if text is smaller than chunk size", () => {
    const text = "Hello world. This is a simple test.";
    const chunks = chunkText(text, { chunkSize: 100 });
    expect(chunks).toEqual([text]);
  });

  it("should split long text into multiple chunks with overlap", () => {
    const text = "This is a sentence. This is another sentence. And here is a third sentence.";
    const chunks = chunkText(text, { chunkSize: 30, chunkOverlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    
    // Check that some words overlap
    expect(chunks[0]).toContain("This is a sentence.");
  });

  it("should avoid word splitting by checking boundaries", () => {
    const text = "Hello myfriend. This is a test of word split prevention.";
    const chunks = chunkText(text, { chunkSize: 20, chunkOverlap: 5 });
    // Chunks should split at space rather than cutting "myfriend" in half
    for (const chunk of chunks) {
      expect(chunk).not.toBe("Hello myf");
      expect(chunk).not.toBe("Hello myfr");
    }
  });

  it("should return empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });
});
