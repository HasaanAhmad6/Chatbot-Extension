/**
 * Converts an ArrayBuffer to a base64 string in chunks (to avoid call-stack
 * overflows from spreading huge typed arrays into String.fromCharCode).
 * Needed because chrome.runtime.sendMessage does not reliably transfer raw
 * ArrayBuffers/Blobs between the background service worker and the offscreen
 * document, but it handles plain strings fine.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Converts a base64 string back into a Uint8Array (inverse of arrayBufferToBase64). */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Returns true if a URL or response looks like a PDF document. */
export function isPdfResource(url: string, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes("application/pdf")) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return false;
  }
}

/**
 * Executes a fetch call with a strict timeout using AbortController.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeout = 8000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Executes a fetch call with automatic exponential backoff retries.
 * Retries on HTTP 429 (Too Many Requests), 5xx Server Errors, or network drop failures.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 4,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, init, 8000);
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        if (i === retries - 1) return response; // Final attempt, return response
        const is429 = response.status === 429;
        const backoff = is429 
          ? (delay * Math.pow(3, i) + 2000) 
          : (delay * Math.pow(2, i));
        console.warn(`[fetchWithRetry] HTTP ${response.status} encountered. Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err; // Final attempt, throw error
      const backoff = delay * Math.pow(2, i);
      console.warn(`[fetchWithRetry] Network error: ${err instanceof Error ? err.message : err}. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error(`Fetch failed after ${retries} attempts`);
}
