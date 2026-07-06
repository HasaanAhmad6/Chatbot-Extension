# RAG Site Explorer: Technical Documentation & User Guide

RAG Site Explorer is a state-of-the-art, token-efficient Chrome Extension built on Manifest V3. It transforms any website you visit into a local, searchable knowledge graph. By combining lightweight sitemap & priority crawling with an LLM-based link router, it allows users to chat naturally with any website using various AI models (Gemini, OpenAI, Anthropic, DeepSeek, Groq, Ollama) completely inside the browser sidepanel.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Core Features](#2-core-features)
3. [Under the Hood: Process Flow](#3-under-the-hood-process-flow)
4. [File Structure & Walkthrough](#4-file-structure--walkthrough)
5. [User Guide: How to Use](#5-user-guide-how-to-use)
6. [Troubleshooting & Best Practices](#6-troubleshooting--best-practices)

---

## 1. Architecture Overview

The extension utilizes Chrome's Manifest V3 architecture. Rather than relying on a costly server-side index, it performs all crawling, DOM cleanup, link filtering, and session caching locally in your browser.

```
                  +----------------------------------------------+
                  |                 Chrome Tab                   |
                  |          (e.g., ucp.edu.pk/academics)        |
                  +----------------------+-----------------------+
                                         |
                                         | Tab Events
                                         v
+----------------------------------------+-----------------------+
|                       Extension Sidepanel                      |
|                                                                |
|  +-------------------+  User Queries  +--------------------+   |
|  |     Settings      | -------------> |     Chat View      |   |
|  |  (API Key, model) |                | (Bubbles, Sources) |   |
|  +-------------------+                +----------+---------+   |
|                                                  |             |
|                                                  | Routes      |
|                                                  v             |
|                                       +--------------------+   |
|                                       |  LLM Link Router   |   |
|                                       +----------+---------+   |
+--------------------------------------------------|-------------+
                                                   |
                             On-Demand Crawl Msg   |
                                                   v
+--------------------------------------------------+-------------+
|                       Background Worker                        |
|                                                                |
|  +-------------------+   DOM Parser   +--------------------+   |
|  | Queue Controller  | -------------> | Offscreen Document |   |
|  | (Robots, Sitemap) | <------------- | (HTML -> CleanText)|   |
|  +---------+---------+   HTML/Text    +--------------------+   |
|            |                                                   |
|            | Directory Map                                     |
|            v                                                   |
|  +---------+---------+                                         |
|  |  Storage Caching  | (chrome.storage.local)                  |
|  +-------------------+                                         |
+----------------------------------------------------------------+
```

---

## 2. Core Features

### 📡 Recursive Sitemap & Priority Crawling
*   **Nested Sitemap Indices:** Automatically detects and recursively resolves complex sitemap indexes (e.g. Yoast SEO). It traverses nested XML sitemaps to retrieve actual content page links.
*   **Bloat Filtering:** Excludes tags, categories, authors, events, members, and other low-value structural directories.
*   **Priority Heuristic:** Scores URLs dynamically during the initial crawl. It prioritizes key landing pages (containing keywords like `admissions`, `apply`, `program`, `contact`, `about`, `eligibility`) to ensure critical info is mapped within the 40-page budget.

### ⚡ Progressive (Lazy) Crawling Fallback
*   **Uncrawled Queue Preservation:** Discovered URLs that exceed the initial 40-page crawl limit are saved in a local queue database (`queue:${domain}`).
*   **On-Demand Scanning:** If you ask a question about a topic not present in the active directory index, the chat engine extracts keyword queries, scans the remaining queue, fetches the target pages instantly, caches them, updates the directory, and re-runs the router.

### 🧠 Token-Optimized Link Routing
*   **Capped Prompts:** The LLM Link Router is fed page titles, URLs, and up to 4 headers (rather than full raw text or large descriptions). This reduces the prompt payload by **~85%** (under 1,500 tokens), preventing rate limits.
*   **Context Truncation:** Fetched content is cleaned of script tags, styles, and headers/footers, and truncated to a maximum of 8,000 characters per page before being sent to the final answer synthesis model.

### 🗂️ Persistent Session & Domain State
*   **Domain-Based Chats:** Chat histories (`chatHistory:${domain}`) and rendering bubbles (`chatBubbles:${domain}`) are indexed per-domain. Switching browser tabs automatically restores the corresponding chat history.
*   **Silent Transitions:** The UI ignores transient redirection/blank loading states and gracefully disables inputs when visiting system pages (`chrome://`, `about:blank`), keeping the chat history clean of system warning bubbles.

---

## 3. Under the Hood: Process Flow

### The RAG Pipeline

When a user submits a query, the extension follows a structured pipeline to fetch the answers:

```
[ User Inputs Question ]
           |
           v
[ Load Site Directory ] (Gets URLs, titles, and headings from chrome.storage)
           |
           v
[ LLM Link Router ] (Determines top 2-3 relevant URLs for the query)
           |
      +----+----+
      |         | Has Selected URLs?
     Yes        No
      |         |
      |         v
      |   [ Scan Queue for Keyword Matches ]
      |         |
      |    +----+----+
      |    |         | Found matches?
      |   Yes        No
      |    |         |
      |    |         v
      |    |   [ Keyword Search Fallback on Mapped Pages ]
      |    v         |
      |   [ Crawl Match On-Demand ]
      |   [ Update Local Directory ]
      |   [ Re-run Link Router ] -> (Resolves Selected URLs)
      |         |
      +---->+<--+
            |
            v
[ Fetch Content ] (Reads from cache or requests Background Worker to load DOM)
            |
            v
[ Text Truncation ] (Cuts body contents to 8,000 characters per page)
            |
            v
[ Answer Synthesis ] (Streams context into LLM to generate response with citations)
```

---

## 4. File Structure & Walkthrough

*   [manifest.json](file:///e:/Projects/Office/Chatbot-Extension/dist/manifest.json): Configuration file defining background service workers, sidepanel overrides, permissions, and offscreen setups.
*   [background.ts](file:///e:/Projects/Office/Chatbot-Extension/src/extension/background.ts): The service worker orchestrator. It handles the crawlers, reads `robots.txt` and `sitemap.xml`, manages the crawling priority queue, and communicates with the offscreen document.
*   [offscreen.ts](file:///e:/Projects/Office/Chatbot-Extension/src/extension/offscreen.ts): A headless DOM context that allows the background worker to parse HTML strings, clean scripts/styles, extract core text safely, and fetch page titles/headings.
*   [sidepanel.ts](file:///e:/Projects/Office/Chatbot-Extension/src/extension/sidepanel.ts): The interface logic. Manages rendering state, text streams, Markdown URL converters, storage persistence, and routes user questions to the adapter factories.
*   [utils.ts](file:///e:/Projects/Office/Chatbot-Extension/src/lib/utils.ts): Shared utility helper exporting `fetchWithRetry` (implements exponential backoff retries on 429 and 5xx statuses up to 4 attempts).
*   [adapterFactories.ts](file:///e:/Projects/Office/Chatbot-Extension/src/lib/adapterFactories.ts): Houses adapter initialization code for OpenAI, Gemini, Anthropic, DeepSeek, Groq, and Ollama.

---

## 5. User Guide: How to Use

### 1. Build and Load the Extension
1. Install dependencies and compile the code:
   ```bash
   npm install
   npm run build
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left and select the `dist/` directory generated in the project root.
5. Click the extension icon in your toolbar to open the sidebar.

### 2. Configure Your API Provider
1. Click the **gear icon (⚙️)** in the top right of the sidepanel.
2. Select your provider (e.g., **Gemini** or **OpenAI**).
3. Enter your API Key.
4. Click **Save Settings**.

### 3. Crawl a Website
1. Navigate to any website you want to explore (e.g., `https://ucp.edu.pk`).
2. Inside the sidepanel, click **Map Domain Now**.
3. The crawler will check the site's `robots.txt` and recursively scan sitemaps, building a priority directory map.
4. Once completed, the interface changes to the chat view.

### 4. Ask Questions & Review Citations
*   Ask questions naturally (e.g., *"What ADP degrees are offered?"* or *"When do admissions close?"*).
*   The assistant will provide answers with styled clickable links and a **Sources** section containing citations. Clicking any source link opens that page in a new browser tab.
*   If you navigate to another tab and come back, your chat state is automatically saved and reloaded.

---

## 6. Troubleshooting & Best Practices

### Resolving Gemini API Rate Limits (HTTP 429)
If you hit rate limits on Gemini's Free Tier:
1. **Wait 10–15 seconds:** The Free Tier restricts requests to 15 Requests Per Minute and 40,000 Tokens Per Minute. Spends cool down quickly.
2. **Use the built-in retry backoff:** The extension automatically retries failed requests up to 4 times, waiting longer after each failure.
3. **Switch to another provider:** If Gemini remains restricted, you can switch to OpenAI, Anthropic, or DeepSeek in your Settings.

### Re-indexing Cache Issues
If a website updates its content or if you want to perform a clean crawl:
1. Click the **Force Re-index** button at the bottom of the chat panel.
2. Confirm the prompt to clear the local storage cache for that domain.
3. Click **Map Domain Now** to rebuild the index from scratch.
