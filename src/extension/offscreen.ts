/**
 * Offscreen script that runs in a separate document context to access full DOM capabilities.
 * Allows DOMParser usage without breaching service worker limitations.
 */
interface ParseHtmlMessage {
  target: "offscreen";
  type: "parse-html" | "extract-links";
  data: {
    html: string;
    url: string;
  };
}

chrome.runtime.onMessage.addListener((message: ParseHtmlMessage, sender, sendResponse) => {
  if (message.target !== "offscreen") {
    return false;
  }

  if (message.type === "parse-html") {
    try {
      const { html, url } = message.data;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const title = doc.title || "";

      // List of boilerplate selectors to strip out to improve similarity scores
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

  if (message.type === "extract-links") {
    try {
      const { html, url } = message.data;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const baseUrl = new URL(url);

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

      sendResponse({ success: true, links });
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
