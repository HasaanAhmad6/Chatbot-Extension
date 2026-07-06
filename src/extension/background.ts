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

function getUrlCrawlScore(url: string, startOrigin: string): number {
  try {
    const u = new URL(url);
    let score = 0;
    if (u.origin !== startOrigin) return -1000;
    const pathname = u.pathname.toLowerCase();
    const segmentCount = pathname.split('/').filter(Boolean).length;
    score -= segmentCount * 10;
    
    const highPriorityKeywords = [
      'admission', 'apply', 'enroll', 'program', 'academic', 
      'course', 'degree', 'contact', 'about', 'faculty', 
      'department', 'eligibility', 'fee', 'structure', 'requirement'
    ];
    highPriorityKeywords.forEach((keyword) => {
      if (pathname.includes(keyword)) {
        score += 30;
      }
    });

    const lowPriorityKeywords = ['news', 'event', 'blog', 'gallery', 'date', 'tag', 'category', 'archive', 'page/'];
    lowPriorityKeywords.forEach((keyword) => {
      if (pathname.includes(keyword)) {
        score -= 20;
      }
    });
    return score;
  } catch {
    return -1000;
  }
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
    const urls: string[] = [];
    const sitemapsToParse = [`${origin}/sitemap.xml`];
    const parsedSitemaps = new Set<string>();

    while (sitemapsToParse.length > 0 && parsedSitemaps.size < 12) {
      const currentSitemap = sitemapsToParse.shift()!;
      if (parsedSitemaps.has(currentSitemap)) continue;
      parsedSitemaps.add(currentSitemap);

      const response = await fetch(currentSitemap);
      if (!response.ok) continue;
      const text = await response.text();

      const regex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          const url = match[1].trim();
          if (url.endsWith('.xml') || url.includes('-sitemap') || url.includes('/sitemap')) {
            const isLowPriority = ['tag', 'category', 'author', 'event', 'member', 'club', 'society', 'citation'].some(
              keyword => url.toLowerCase().includes(keyword)
            );
            if (!isLowPriority) {
              sitemapsToParse.push(url);
            }
          } else {
            urls.push(url);
          }
        }
      }
    }

    return urls;
  } catch (err) {
    console.warn("Failed to fetch/parse sitemap:", err);
    return [];
  }
}

// Main recursive queue-based crawl and directory builder
async function runCrawlAndBuildDirectory(domain: string, startUrl: string) {
  const origin = new URL(startUrl).origin;
  const state: CrawlState = {
    status: "crawling",
    progress: 0,
    total: 0,
    message: "Initializing site crawler...",
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

    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const directory: PageMetadata[] = [];
    const maxPages = 40;

    // Check for sitemap to pre-populate queue
    state.message = "Checking for sitemap.xml...";
    notifyChange();
    const sitemapUrls = await parseSitemap(origin);
    if (sitemapUrls.length > 0) {
      for (const url of sitemapUrls) {
        try {
          const u = new URL(url);
          const cleanUrl = u.origin + u.pathname;
          if (isUrlAllowed(cleanUrl, disallowed) && !queue.includes(cleanUrl)) {
            queue.push(cleanUrl);
          }
        } catch {}
      }
    }

    // Prioritize sitemap and start URLs
    queue.sort((a, b) => getUrlCrawlScore(b, origin) - getUrlCrawlScore(a, origin));

    state.total = maxPages;
    notifyChange();

    while (queue.length > 0 && directory.length < maxPages) {
      // Dequeue a batch of up to 4 URLs to fetch in parallel
      const batch = queue.splice(0, Math.min(4, maxPages - directory.length));
      
      await Promise.all(
        batch.map(async (url) => {
          // Normalize URL by removing hash and query parameters
          let cleanUrl = url;
          try {
            const u = new URL(url);
            cleanUrl = u.origin + u.pathname;
          } catch {}

          if (visited.has(cleanUrl)) return;
          visited.add(cleanUrl);

          try {
            const pathName = new URL(url).pathname;
            state.message = `Crawling: ${pathName.length > 15 ? pathName.slice(0, 15) + "..." : pathName}...`;
            notifyChange();

            const response = await fetch(url);
            if (!response.ok) return;
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

              // Extract and add new links to the queue
              if (Array.isArray(metaResult.links)) {
                let addedNewLink = false;
                for (const link of metaResult.links) {
                  try {
                    const u = new URL(link);
                    const linkClean = u.origin + u.pathname;
                    if (
                      u.origin === origin &&
                      (u.protocol === "http:" || u.protocol === "https:") &&
                      isUrlAllowed(linkClean, disallowed) &&
                      !visited.has(linkClean) &&
                      !queue.includes(linkClean)
                    ) {
                      queue.push(linkClean);
                      addedNewLink = true;
                    }
                  } catch {}
                }
                if (addedNewLink) {
                  queue.sort((a, b) => getUrlCrawlScore(b, origin) - getUrlCrawlScore(a, origin));
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to crawl ${url}:`, err);
          }
        })
      );

      state.progress = directory.length;
      notifyChange();

      // Brief delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (directory.length === 0) {
      throw new Error("Could not crawl any pages on this domain.");
    }

    // Store directory map and remaining queue locally
    const directoryKey = `directory:${domain}`;
    const queueKey = `queue:${domain}`;
    await chrome.storage.local.set({
      [directoryKey]: {
        domain,
        timestamp: Date.now(),
        pages: directory,
      },
      [queueKey]: queue
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
