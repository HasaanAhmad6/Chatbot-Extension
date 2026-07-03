interface CrawlState {
  status: "idle" | "crawling" | "completed" | "error";
  progress: number;
  total: number;
  message: string;
  domain: string;
}

interface PageMetadata {
  url: string;
  title: string;
  description: string;
  headings: string[];
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
    justification: "DOM parser required to extract metadata and page text",
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

// Main crawl and index directory builder
async function runCrawlAndBuildDirectory(domain: string, startUrl: string) {
  const origin = new URL(startUrl).origin;
  const state: CrawlState = {
    status: "crawling",
    progress: 0,
    total: 0,
    message: "Initializing site directory map...",
    domain,
  };
  crawlStates.set(domain, state);

  const notifyChange = () => {
    chrome.runtime.sendMessage({
      type: "CRAWL_STATUS_UPDATE",
      data: state,
    }).catch(() => {
      // Sidebar might be closed
    });
  };

  notifyChange();

  try {
    await createOffscreenDocument();

    const disallowed = await getDisallowedPaths(origin);
    let urlsToCrawl = await parseSitemap(origin);

    // If sitemap didn't return any URLs, fall back to parsing home page links
    if (urlsToCrawl.length === 0) {
      state.message = "Sitemap.xml not found. Extracting links from homepage...";
      notifyChange();

      const response = await fetch(startUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch homepage: ${response.statusText}`);
      }
      const html = await response.text();
      
      const res = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "parse-metadata",
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

    // Ensure start URL is included
    if (!filteredUrls.includes(startUrl)) {
      filteredUrls.unshift(startUrl);
    }
    filteredUrls = filteredUrls.slice(0, 30);

    if (filteredUrls.length === 0) {
      throw new Error("No public pages discovered on this domain.");
    }

    state.total = filteredUrls.length;
    state.message = `Mapping metadata for ${filteredUrls.length} pages...`;
    notifyChange();

    const directory: PageMetadata[] = [];
    const concurrencyLimit = 5;

    // Fetch page metadata in batches of 5 in parallel to build directory quickly
    for (let i = 0; i < filteredUrls.length; i += concurrencyLimit) {
      const batch = filteredUrls.slice(i, i + concurrencyLimit);
      
      await Promise.all(
        batch.map(async (url) => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              return;
            }
            const html = await response.text();

            const metaResult = await chrome.runtime.sendMessage({
              target: "offscreen",
              type: "parse-metadata",
              data: { html, url },
            });

            if (metaResult && metaResult.success) {
              directory.push({
                url,
                title: metaResult.title || url,
                description: metaResult.description || "",
                headings: metaResult.headings || [],
              });
            }
          } catch (err) {
            console.warn(`Error mapping page ${url}:`, err);
          }
        })
      );

      state.progress = directory.length;
      state.message = `Mapped ${directory.length} of ${filteredUrls.length} pages...`;
      notifyChange();
      
      // Delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (directory.length === 0) {
      throw new Error("Could not extract metadata from any discovered pages.");
    }

    // Store directory map locally
    const directoryKey = `directory:${domain}`;
    await chrome.storage.local.set({
      [directoryKey]: {
        domain,
        timestamp: Date.now(),
        pages: directory,
      },
    });

    state.status = "completed";
    state.message = `Successfully mapped directory of ${directory.length} pages!`;
    notifyChange();

  } catch (err) {
    console.error("Directory building error:", err);
    state.status = "error";
    state.message = err instanceof Error ? err.message : String(err);
    notifyChange();
  }
}

// Fetch and clean a single page (on-demand loading)
async function fetchAndCleanPage(url: string): Promise<{ success: boolean; text?: string; title?: string; error?: string }> {
  try {
    await createOffscreenDocument();
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const html = await response.text();

    const parseResult = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "parse-html",
      data: { html, url },
    });

    if (parseResult && parseResult.success) {
      return {
        success: true,
        text: parseResult.text,
        title: parseResult.title || url,
      };
    } else {
      throw new Error(parseResult?.error || "Parsing failed");
    }
  } catch (err) {
    console.error(`Failed to load page content for ${url}:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Handle messaging from sidebar UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    return false;
  }

  if (message.type === "START_CRAWL") {
    const { domain, url } = message.data;
    runCrawlAndBuildDirectory(domain, url);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_CRAWL_STATUS") {
    const { domain } = message.data;
    const state = crawlStates.get(domain) || {
      status: "idle",
      progress: 0,
      total: 0,
      message: "No directory jobs currently running.",
      domain,
    };
    sendResponse(state);
    return true;
  }

  if (message.type === "FETCH_PAGE") {
    const { url } = message.data;
    fetchAndCleanPage(url).then(sendResponse);
    return true; // Keep channel open for async response
  }

  return false;
});
