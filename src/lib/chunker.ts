/**
 * Word-boundary aware character sliding window text splitter.
 * Splitting text on clean boundaries (e.g. whitespace) improves RAG embedding quality.
 */
export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { chunkSize = 800, chunkOverlap = 150 } = options;
  
  // Clean up excessive spacing/newlines first
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  
  if (normalizedText.length <= chunkSize) {
    return normalizedText ? [normalizedText] : [];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < normalizedText.length) {
    let end = start + chunkSize;
    
    if (end < normalizedText.length) {
      // Find the last space or newline within the threshold window to avoid word splits
      const lastSpace = normalizedText.lastIndexOf(" ", end);
      const lastNewline = normalizedText.lastIndexOf("\n", end);
      const boundary = Math.max(lastSpace, lastNewline);
      
      // If boundary is close enough (within 100 characters of the end), split there
      if (boundary > start + chunkSize - 100) {
        end = boundary;
      }
    }
    
    const chunk = normalizedText.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    
    // Advance by size minus overlap
    const nextStart = end - chunkOverlap;
    
    // Prevent infinite loop if overlap is too large or we aren't advancing
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
    
    // If the remaining text is smaller than overlap, stop
    if (start >= normalizedText.length - 20) {
      break;
    }
  }
  
  return chunks;
}
