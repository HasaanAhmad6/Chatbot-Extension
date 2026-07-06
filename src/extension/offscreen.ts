/**
 * Offscreen script that runs in a separate document context to access full DOM capabilities.
 * Allows DOMParser usage without breaching service worker limitations.
 */
import * as pdfjsLib from "pdfjs-dist";
import { base64ToUint8Array } from "../lib/utils";

// The worker file is copied to dist/pdf.worker.mjs by scripts/copy-assets.cjs.
// isEvalSupported is disabled defensively so pdf.js never relies on eval/new Function,
// keeping it compliant with the extension's default Manifest V3 CSP.
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");

const MAX_PDF_TEXT_CHARS = 20000;

async function extractPdfText(base64Data: string): Promise<{ title: string; text: string }> {
  const bytes = base64ToUint8Array(base64Data);
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  let title = "";
  try {
    const meta = await pdf.getMetadata();
    title = (meta?.info as any)?.Title || "";
  } catch {
    // Some PDFs have no/invalid metadata - not fatal.
  }

  let text = "";
  const maxPages = Math.min(pdf.numPages, 30);
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    if (text.length > MAX_PDF_TEXT_CHARS) break;
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str || "").join(" ");
    text += pageText + "\n\n";
  }

  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  if (text.length > MAX_PDF_TEXT_CHARS) {
    text = text.slice(0, MAX_PDF_TEXT_CHARS) + "\n... [PDF content truncated] ...";
  }

  return { title, text };
}

type ParseHtmlMessage =
  | {
      target: "offscreen";
      type: "parse-html" | "parse-metadata";
      data: { html: string; url: string };
    }
  | {
      target: "offscreen";
      type: "parse-pdf" | "parse-pdf-metadata";
      data: { base64Data: string; url: string };
    };

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
      const mainEl = doc.querySelector("main, article, #content, .content, #main, .entry-content, .post-content, #content-area");
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

  // Action 3: Extract full text from a PDF (for chat RAG context)
  if (message.type === "parse-pdf") {
    const { base64Data, url } = message.data;
    if (!base64Data) {
      sendResponse({ success: false, error: "Missing PDF data" });
      return true;
    }
    extractPdfText(base64Data)
      .then(({ title, text }) => {
        sendResponse({ success: true, text, title: title || url, url });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  // Action 4: Lightweight PDF metadata pass (for directory/index building during crawl)
  if (message.type === "parse-pdf-metadata") {
    const { base64Data, url } = message.data;
    if (!base64Data) {
      sendResponse({ success: false, error: "Missing PDF data" });
      return true;
    }
    extractPdfText(base64Data)
      .then(({ title, text }) => {
        // No outgoing links in a PDF, but surface the first line of text as a
        // pseudo-heading so the Link Router has a signal beyond the filename.
        const firstLine = text.split("\n").find((l) => l.trim().length > 3) || "";
        sendResponse({
          success: true,
          title: title || url,
          description: text.slice(0, 200),
          headings: firstLine ? [firstLine.slice(0, 150)] : [],
          links: [],
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  return false;
});
