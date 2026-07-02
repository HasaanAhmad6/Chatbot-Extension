import { chunkText } from "../lib/chunker";
import {
  createGeminiEmbeddingAdapter,
  createOpenAIEmbeddingAdapter,
  createCohereEmbeddingAdapter,
} from "../lib/adapterFactories";

interface CrawlState {
  status: "idle" | "crawling" | "embedding" | "completed" | "error";
  progress: number;
  total: number;
  message: string;
  domain: string;
}

const crawlStates = new Map<string, CrawlState>();

// Handle extension icon clicks by opening the sidebar
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

async function createOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: "DOM parser required to extract text and links from crawled pages",
  });
}

// Simple robots.txt parser
async function getDisallowedPaths(origin: string): Promise<string[]> {
  try {
    const response = await fetch(`${origin}/robots.txt`);
    if (!response.ok) return [];
    const text = await response.text();
    const disallowed: string[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.trim().toLowerCase().startsWith("disallow:")) {
        const path = line.split(":")[1]?.trim();
        if (path) disallowed.push(path);
      }
    }
    return disallowed;
  } catch (err) {
    console.warn("Failed to fetch/parse robots.txt:", err);
    return [];
  }
}

function isUrlAllowed(urlStr: string, disallowedPaths: string[]): boolean {
  try {
    const url = new URL(urlStr);
    return !disallowedPaths.some((path) => {
      // Clean wildcards or match prefixes
      const cleanPath = path.replace(/\*/g, "");
      return url.pathname.startsWith(cleanPath);
    });
  } catch {
    return false;
  }
}

// Sitemap parser returning list of URLs
async function parseSitemap(origin: string): Promise<string[]> {
  try {
    const response = await fetch(`${origin}/sitemap.xml`);
    if (!response.ok) return [];
    const text = await response.text();
    const urls: string[] = [];
    const regex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        urls.push(match[1].trim());
      }
    }
    return urls;
  } catch (err) {
    console.warn("Failed to fetch/parse sitemap.xml:", err);
    return [];
  }
}

// Main crawl and index runner
async function runCrawlAndIndex(domain: string, startUrl: string) {
  const origin = new URL(startUrl).origin;
  const state: CrawlState = {
    status: "crawling",
    progress: 0,
    total: 0,
    message: "Initializing crawler...",
    domain,
  };
  crawlStates.set(domain, state);

  const notifyChange = () => {
    chrome.runtime.sendMessage({
      type: "CRAWL_STATUS_UPDATE",
      data: state,
    }).catch(() => {
      // Sidebar might be closed, ignore messaging errors
    });
  };

  notifyChange();

  try {
    await createOffscreenDocument();

    const disallowed = await getDisallowedPaths(origin);
    let urlsToCrawl = await parseSitemap(origin);

    // Sitemap didn't return any URLs, fall back to parsing home page links
    if (urlsToCrawl.length === 0) {
      state.message = "Sitemap.xml not found. Extracting links from homepage...";
      notifyChange();

      const response = await fetch(startUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch home page: ${response.statusText}`);
      }
      const html = await response.text();
      
      const res = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "extract-links",
        data: { html, url: startUrl },
      });

      if (res && res.success && Array.isArray(res.links)) {
        urlsToCrawl = res.links;
      }
    }

    // Filter URLs (same-origin, not disallowed, valid scheme)
    let filteredUrls = Array.from(new Set(urlsToCrawl))
      .filter((urlStr) => {
        try {
          const u = new URL(urlStr);
          return (
            u.origin === origin &&
            (u.protocol === "http:" || u.protocol === "https:") &&
            isUrlAllowed(urlStr, disallowed)
          );
        } catch {
          return false;
        }
      })
      .slice(0, 30); // Cap at 30 pages max

    // Ensure start URL is included if not already there
    if (!filteredUrls.includes(startUrl)) {
      filteredUrls.unshift(startUrl);
    }
    filteredUrls = filteredUrls.slice(0, 30);

    if (filteredUrls.length === 0) {
      throw new Error("No public crawler-allowed pages found on this domain.");
    }

    state.total = filteredUrls.length;
    state.message = `Discovered ${filteredUrls.length} pages. Crawling content...`;
    notifyChange();

    const pagesData: Array<{ url: string; text: string; title: string }> = [];

    for (const url of filteredUrls) {
      state.message = `Crawling: ${url}`;
      notifyChange();

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Failed to fetch page ${url}: ${response.statusText}`);
          state.progress++;
          continue;
        }
        const html = await response.text();

        const parseResult = await chrome.runtime.sendMessage({
          target: "offscreen",
          type: "parse-html",
          data: { html, url },
        });

        if (parseResult && parseResult.success) {
          pagesData.push({
            url,
            text: parseResult.text,
            title: parseResult.title || url,
          });
        }
      } catch (err) {
        console.warn(`Error crawling page ${url}:`, err);
      }

      state.progress++;
      // Rate-limit delay (300-500ms)
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (pagesData.length === 0) {
      throw new Error("Could not extract readable content from any of the crawled pages.");
    }

    // Chunking text
    state.status = "embedding";
    state.progress = 0;
    state.message = "Preparing text chunks...";
    notifyChange();

    const chunksToEmbed: Array<{ content: string; metadata: { url: string; title: string } }> = [];
    for (const page of pagesData) {
      const chunks = chunkText(page.text, { chunkSize: 800, chunkOverlap: 150 });
      for (const content of chunks) {
        chunksToEmbed.push({
          content,
          metadata: { url: page.url, title: page.title },
        });
      }
    }

    if (chunksToEmbed.length === 0) {
      throw new Error("Text chunking yielded zero valid content blocks.");
    }

    state.total = chunksToEmbed.length;
    state.message = `Generated ${chunksToEmbed.length} chunks. Creating embeddings...`;
    notifyChange();

    // Fetch API Settings
    const settings = await chrome.storage.local.get(["provider", "apiKey", "embeddingModel"]);
    const { provider, apiKey, embeddingModel } = settings;

    if (!apiKey) {
      throw new Error("Missing API key. Please check your settings.");
    }

    // Initialize adapter based on provider
    let embedAdapter;
    if (provider === "gemini") {
      embedAdapter = createGeminiEmbeddingAdapter(apiKey);
    } else if (provider === "openai") {
      embedAdapter = createOpenAIEmbeddingAdapter(apiKey, embeddingModel || "text-embedding-3-small");
    } else if (provider === "cohere") {
      embedAdapter = createCohereEmbeddingAdapter(apiKey, embeddingModel || "embed-english-v3.0");
    } else {
      // Default fallback
      embedAdapter = createGeminiEmbeddingAdapter(apiKey);
    }

    const finalChunks: Array<{ content: string; embedding: number[]; metadata: { url: string; title: string } }> = [];
    
    // Batch embedding generation with concurrency limit (e.g. 5 at a time)
    const concurrencyLimit = 5;
    for (let i = 0; i < chunksToEmbed.length; i += concurrencyLimit) {
      const batch = chunksToEmbed.slice(i, i + concurrencyLimit);
      
      state.message = `Embedding chunks ${i + 1} to ${Math.min(i + concurrencyLimit, chunksToEmbed.length)} of ${chunksToEmbed.length}...`;
      notifyChange();

      await Promise.all(
        batch.map(async (item) => {
          try {
            const embedding = await embedAdapter(item.content);
            finalChunks.push({
              content: item.content,
              embedding,
              metadata: item.metadata,
            });
          } catch (err) {
            console.error("Embedding generation failed for chunk:", err);
          }
        })
      );
      
      state.progress = finalChunks.length;
      notifyChange();
      // Brief pause to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (finalChunks.length === 0) {
      throw new Error("Failed to generate vector embeddings for any of the content chunks.");
    }

    // Save index to storage
    const storageKey = `index:${domain}`;
    await chrome.storage.local.set({
      [storageKey]: {
        domain,
        timestamp: Date.now(),
        pageCount: pagesData.length,
        chunks: finalChunks,
      },
    });

    state.status = "completed";
    state.message = `Successfully indexed ${pagesData.length} pages into ${finalChunks.length} searchable vectors!`;
    notifyChange();

  } catch (err) {
    console.error("Crawling/indexing error:", err);
    state.status = "error";
    state.message = err instanceof Error ? err.message : String(err);
    notifyChange();
  }
}

// Handle messaging from sidebar UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    return false;
  }

  if (message.type === "START_CRAWL") {
    const { domain, url } = message.data;
    runCrawlAndIndex(domain, url);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_CRAWL_STATUS") {
    const { domain } = message.data;
    const state = crawlStates.get(domain) || {
      status: "idle",
      progress: 0,
      total: 0,
      message: "No indexing jobs currently running.",
      domain,
    };
    sendResponse(state);
    return true;
  }

  return false;
});
