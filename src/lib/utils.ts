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
      const response = await fetch(url, init);
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
