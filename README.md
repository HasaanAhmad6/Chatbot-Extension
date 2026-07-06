# Rag Site Explorer (Chrome Extension)

Rag Site Explorer is a secure, production-grade Manifest V3 Chrome Extension that turns any public website into a private, local knowledge base you can chat with. 

Instead of deploying databases or writing server-side ingestion scripts, you can crawl, index, and query entire website domains directly from your browser's side panel using your own API keys.

---

## ⚡ Features

*   **📰 Manifest V3 Extension Sidebar**: Lives natively inside your Google Chrome Side Panel, opening automatically when you click the extension action.
*   **🕷️ Lightning-Fast Recursive Crawler**: A background crawl engine (`background.ts`) running a BFS queue that maps domain structures up to 40 pages deep in seconds, automatically seeded by `sitemap.xml` when present and fully respecting `robots.txt` exclusion rules.
*   **🧼 Offscreen DOM Sanitization**: Fetches pages and cleans HTML safely using an offscreen document (`offscreen.ts`), stripping boilerplates like navbars, headers, footers, and scripts to extract high-quality plain text.
*   **🤖 Agentic Link Router**: Eliminates heavy vector database queries. An LLM-based Link Router acts as an agent to analyze the site directory map and select the top 2-3 pages most likely to contain the answer to the user's question.
*   **⚡ Local Caching & Rate-Limit Mitigation**:
    *   Caches parsed page content under `cache:${url}` locally for 24 hours to eliminate redundant network requests.
    *   Truncates page content inputs to a maximum of 12,000 characters to stay within free-tier API token limits.
    *   Provides friendly error handling for HTTP 429 API rate limits.
*   **🔑 Bring Your Own Keys (BYOK)**: Supports multiple provider adapters: **Gemini**, **OpenAI**, **Anthropic**, **DeepSeek**, **Groq**, **Ollama**, and generic **OpenAI-Compatible** endpoints (e.g. Together AI, Mistral, Cohere). Keys are stored safely using `chrome.storage.local`.

---

## 🛠️ Installation & Setup (Developer Mode)

To run the extension locally in developer mode:

### 1. Build the Extension
Clone the repository and install the development dependencies:
```bash
npm install
```

Compile and bundle the extension (writes files to the `dist/` directory):
```bash
npm run build
```
*(Or use `npm run dev` to watch for file changes during development).*

### 2. Load into Google Chrome
1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** by toggling the switch in the top-right corner.
3.  Click **Load unpacked** in the top-left corner.
4.  Select the **`dist`** directory in the root of this project.
5.  Pin the **Rag Site Explorer** extension for quick access.

---

## 🖥️ How It Works

This project uses a Manifest V3 architecture comprising three primary components:

```
[ sidepanel.ts (UI & LLM Router) ]
         │
         ├─── Sends crawl requests ───► [ background.ts (BFS Crawler) ]
         │                                       │
         ◄─── Sends sanitized page text ─────────┼─── Fetches page HTML
                                                 ▼
                                     [ offscreen.ts (DOM Parser) ]
```

1.  **Sidebar UI (`sidepanel.ts`)**: Integrates settings configuration, crawling progress indicators, and a streaming chat client. 
2.  **Service Worker Crawler (`background.ts`)**: Runs in the background to handle rate-limited crawling, parse sitemaps, track indexed state per domain, and handle tab transition changes.
3.  **Offscreen DOM Parser (`offscreen.ts`)**: Creates a safe DOM parser context to strip HTML templates, advertisements, and page scripts without triggering security sandboxing errors.

---

## 📖 How to Use

1.  **Configure Your API Key**:
    *   Open the side panel by clicking the extension icon.
    *   Navigate to the **Settings** tab (gear icon).
    *   Select your desired AI Provider (e.g., Gemini, OpenAI, DeepSeek).
    *   Provide your API Key (and optionally customize the Model name).
    *   Click **Save Settings**.
2.  **Index a Website**:
    *   Navigate to any public website you want to research.
    *   Click **Crawl Domain** in the side panel. 
    *   Watch the crawler index page headers, links, and text content in real-time.
    *   You can force a clean re-crawl at any time by clicking the **Force Re-index** button.
3.  **Chat with the Domain**:
    *   Enter your question in the message input.
    *   The **Agentic Link Router** automatically analyzes your question, selects the most relevant pages, reads them from local cache or fetches them, and feeds the context to the LLM.
    *   The answer streams back to the UI in real-time.

---

## 📁 Directory Structure

```
├── dist/                     # Compiled files ready for Chrome Extensions load
├── scripts/
│   └── copy-assets.cjs       # Helper script to copy static assets to dist/
├── src/
│   ├── extension/
│   │   ├── manifest.json     # Chrome Extension manifest
│   │   ├── sidepanel.html    # Side panel UI structure
│   │   ├── sidepanel.ts      # Side panel UI controller and LLM Router
│   │   ├── background.ts     # Service worker BFS crawler
│   │   ├── offscreen.html    # Offscreen DOM utility page
│   │   ├── offscreen.ts      # Offscreen HTML parser
│   │   └── privacy.html      # Privacy Policy document
│   ├── lib/
│   │   ├── adapterFactories.ts # Factory methods for LLM API wrappers
│   │   ├── adapters.ts       # Shared adapter interface contracts
│   │   └── utils.ts          # Retry backoffs and generic utility helpers
│   ├── styles/
│   │   └── chatbot.css       # Extension sidepanel UI stylesheet
│   ├── tests/
│   │   └── sanity.test.ts    # Vitest testing suite
│   ├── types.ts              # Type declarations
│   └── global.d.ts           # Global TS definitions
├── package.json              # Compilation scripts and dependencies
├── tsconfig.json             # TypeScript configuration
└── tsup.config.ts            # Tsup bundling config
```

---

## 🧪 Testing

The repository includes a Vitest suite to verify structural extraction and helper logic:

```bash
npm run test
```

---

## 📄 License

MIT © Hasaan Ahmad
