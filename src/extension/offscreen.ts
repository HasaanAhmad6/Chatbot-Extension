/**
 * Offscreen script that runs in a separate document context to access full DOM capabilities.
 * Allows DOMParser usage without breaching service worker limitations.
 */
interface ParseHtmlMessage {
  target: "offscreen";
  type: "parse-html" | "parse-metadata";
  data: {
    html: string;
    url: string;
  };
}

chrome.runtime.onMessage.addListener((message: ParseHtmlMessage, sender, sendResponse) => {
  if (message.target !== "offscreen") {
    return false;
  }

  // Action 1: Parse and clean visible page content (for chat RAG context)
  if (message.type === "parse-html") {
    try {
      const { html, url } = message.data;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const title = doc.title || "";

      // List of boilerplate selectors to strip out to improve context quality
      const selectorToStrip = [
        "script",
        "style",
        "noscript",
        "iframe",
        "nav",
        "footer",
        "header",
        "svg",
        "img",
        "[role='navigation']",
        "[role='banner']",
        "[role='contentinfo']",
        ".navigation",
        ".header",
        ".footer",
        ".sidebar",
        ".menu",
        ".cookie",
        ".banner",
        ".popup",
        ".modal",
        "#navigation",
        "#header",
        "#footer",
        "#sidebar",
        "#menu",
      ].join(",");

      doc.querySelectorAll(selectorToStrip).forEach((el) => el.remove());

      // Focus on main content area if available, fallback to body
      let container: Element = doc.body || doc.documentElement;
      const mainEl = doc.querySelector("main, article, #content, .content, #main");
      if (mainEl && mainEl.textContent && mainEl.textContent.trim().length > 100) {
        container = mainEl;
      }

      // Extract text content and normalize whitespaces
      let text = container.textContent || "";
      text = text
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .replace(/\r/g, "")
        .trim();

      sendResponse({ success: true, text, title, url });
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  // Action 2: Parse page metadata & links (for lightweight indexing during crawl setup)
  if (message.type === "parse-metadata") {
    try {
      const { html, url } = message.data;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const baseUrl = new URL(url);

      const title = doc.title || "";

      // Gather page headings (h1, h2, h3)
      const headings: string[] = [];
      doc.querySelectorAll("h1, h2, h3").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 150) {
          headings.push(text);
        }
      });

      // Gather meta description
      let description = "";
      const metaDesc = doc.querySelector("meta[name='description']");
      if (metaDesc) {
        description = metaDesc.getAttribute("content")?.trim() || "";
      }

      // Gather links
      const links: string[] = [];
      doc.querySelectorAll("a[href]").forEach((el) => {
        const href = el.getAttribute("href");
        if (!href) return;
        try {
          const absoluteUrl = new URL(href, baseUrl.href).href;
          links.push(absoluteUrl);
        } catch (_) {
          // ignore invalid relative urls
        }
      });

      sendResponse({
        success: true,
        title,
        description,
        headings: Array.from(new Set(headings)).slice(0, 15), // Cap headings to avoid bloat
        links: Array.from(new Set(links)),
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  return false;
});
