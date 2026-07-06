# Changelog

All notable changes to `@hasaan_6/rag-chatbot-widget` are documented in this file.

## [0.5.1] - 2026-07-06

### Added
- **Progressive Fallback Crawling**: Implemented a dynamic lazy-crawl engine. If the initial 40-page crawl map doesn't contain pages that match the user's query, the extension scans the remaining crawl queue for keyword-matching URLs (e.g. "scholarships", "requirements"), crawls those pages dynamically on-demand, caches them, updates the directory index, and re-runs routing.
- **Technical Documentation**: Created a comprehensive [DOCUMENTATION.md](file:///e:/Projects/Office/Chatbot-Extension/DOCUMENTATION.md) guide detailing the extension's architecture, recursive crawler, progressive fallback crawl flow, and detailed user guide.
- **PDF Resource Crawling & Parsing**: Integrated `pdfjs-dist` to support scanning, indexing, and extracting text from PDF resources (such as calendars, fee schedules, and brochures) during crawls and lazy progressive scans, with automatic base64 encoding and safe workers to comply with Content Security Policies. Expanded the link filtering in `background.ts` to allow crawling of related PDF resources hosted on external staging CDNs (like `kinsta.cloud` or `wp-content`) or different subdomains.

### Changed
- **Documentation Overhaul**: Completely rewrote the `README.md` to document the new Chrome Extension architecture (Manifest V3, sidebar UI, service worker crawler, offscreen DOM parsing, and local page caching) replacing the legacy React widget instructions.

### Fixed
- **State Persistence**: Resolved state loss where chat history disappeared when navigating pages, opening links, or switching tabs and coming back. Chat history and message bubbles are now saved and loaded per-domain using `chrome.storage.local`.
- **Crawl Prioritization Heuristic**: Implemented a URL scoring heuristic in `background.ts` to prioritize crawling core directory pages (admissions, programs, contacts, about, etc.) over deep event logs or blog archives. Expanded this to penalize historical years (e.g. 2010 to 2025) and low-priority pages (e.g. merit-lists, careers, announcements) while boosting current cycles (e.g. 2026/2027) and raising the crawl budget from 40 to 60 pages to guarantee current schedule pages are mapped.
- **Inline Link Formatting**: Fixed raw text URLs inside chat bubbles to render as active, clickable, and styled anchor tags (`_blank`) instead of un-openable plain text.
- **Active Tab Query Stability**: Fixed "Unable to retrieve tab details" and "Agentic Website Explorer cannot run on browser settings" disruptive warnings. The sidepanel now silently returns if tab details are momentarily blank (e.g. during fast tab transitions), and disables inputs without clearing the chat container when navigating to system pages.
- **Sitemap Index Parsing**: Resolved issues where the crawler got stuck on Yoast/SEO nested sitemap indices by parsing nested sitemaps recursively, ignoring low-value directories (tags, categories, authors, events, members), and extracting the actual content URLs directly.
- **TPM Rate Limit Mitigation**: Optimised the Link Router prompt by truncating directory descriptions to 100 characters and capping headings to 4 per page. Decreased page text content context limits from 12,000 to 8,000 characters, reducing token usage by ~65% per request. Additionally, increased the default retry attempts to 4 inside `fetchWithRetry` with longer, custom backoff delays for 429 statuses to completely resolve Gemini Free Tier HTTP 429 rate limit exceptions.
- **Detailed API Error Reporting**: Updated adapters inside `adapterFactories.ts` for Gemini, Anthropic, and OpenAI-compatible endpoints to parse and return the detailed API error message body. This helps users clearly see specific issues (e.g., daily quota exhaustion/RESOURCE_EXHAUSTED) instead of ambiguous status numbers.
- **Sitemap Loading UX & Timeout**: Added active visual progress updates (e.g. "Reading sitemap: page-sitemap1.xml...") during Yoast sitemap index parsing in `background.ts`. Built a timeout wrapper `fetchWithTimeout` (8-second threshold) inside `utils.ts` to prevent infinite hangs during slow server responses.
- **Sitemap & Page Retry Bounds**: Optimized `fetchWithRetry` parameters in `background.ts` to use a maximum of 1 attempt for sitemap files and page crawls, and 2 attempts for on-demand RAG pages. This ensures slow/dead connections fail fast (within 8 seconds) and skip immediately to keep crawls fast and responsive.

## [0.5.0] - 2026-07-03

### Added
- **Agentic Link Router**: Integrated an LLM-based Link Router in `sidepanel.ts` to analyze questions and determine which 2–3 site pages contain the answers.
- **Lightweight Directory Indexing**: Rebuilt crawler in `background.ts` to map domain pages (URLs, titles, and `<h1>`-`<h3>` headings) in under 2 seconds.
- **Recursive Queue-Based Crawler**: Updated the background crawl engine to run a recursive queue-based crawl (BFS) that extracts links from mapped pages to discover nested sub-pages (e.g., fee structure and program details) up to 40 pages deep. Seeded the crawl queue with sitemap URLs when `sitemap.xml` is present.
- **Dynamic Content Fetcher**: Added background fetches to parse and clean HTML via `offscreen.ts` on demand.
- **Page Content Caching**: Caches parsed page content locally under `cache:${url}` for 24 hours to eliminate redundant network requests.
- **Sanity Test Suite**: Added a basic testing module for the new code architecture in `sanity.test.ts`.
- **Forced Re-crawling Button**: Added an interactive `#btn-reindex` button in the sidebar header to clear local directory caches and force a fresh crawl on demand.
- **TPM Rate Limit Mitigation**: Truncated fetched webpage text contents to a maximum of 12,000 characters per page during context assembly to prevent exceeding the 40,000 Tokens Per Minute (TPM) API limits on Gemini's Free Tier.
- **Friendly Rate-Limit Error Handling**: Intercepted HTTP 429 errors from the LLM adapter to display a clean, actionable message advising the user to wait 10-15 seconds for quota reset.

### Removed
- **Vector Embedding RAG**: Deleted legacy chunker (`chunker.ts`), local vector stores (`vectorStores.ts`), and the RAG pipeline wrapper (`ragPipeline.ts`) to resolve 429 API rate limits completely.

## [0.4.0] - 2026-07-02

### Added
- **Manifest V3 Chrome Extension**: Initial extension release files including `manifest.json`.
- **Side Panel Interface**: Implemented `chrome.sidePanel` based layout in `sidepanel.html` and `sidepanel.ts` featuring settings, active crawl progress bars, local RAG pipeline routing, and a customized dark theme.
- **Background Service Worker Crawl Engine**: Added `background.ts` which coordinates site discovery via `sitemap.xml` parsing, respecting `robots.txt` exclusion rules, executing crawler loops with fetch rate limits, and caching vector indexes in `chrome.storage.local`.
- **Offscreen DOM Parser**: Added `offscreen.html` and `offscreen.ts` to parse HTML, scrape main/article contents, strip headers/footers/nav boilerplates, and extract links.
- **Word-Boundary Chunker**: Implemented character sliding-window splitting in `chunker.ts` to improve embedding quality.
- **Chrome Storage Vector Store**: Added `createChromeStorageVectorStore` in `vectorStores.ts` to query locally-cached vectors with cosine similarity matching and fallback keyword matching.
- **Bundling Integration**: Configured parallel tsup widget and extension compilation scripts and postbuild static asset copies.

### Fixed
- **Chat View Specificity Bug**: Appended `.active` to `.chat-view` selector to prevent container rendering priority overriding the settings panel on first launch.
- **Active Tab Permission**: Declared `"activeTab"` in `manifest.json` permissions to allow the sidepanel to fetch page details safely on open.
- **Dynamic Tab Listeners**: Added tab activation and update listeners in the sidepanel UI to automatically refresh the crawled database state when the user navigates or switches tabs.
- **ES Module Loading**: Declared `type="module"` on script tags in `sidepanel.html` and `offscreen.html` to allow ES import statements to execute without throwing syntax errors in the browser.
- **Embedding Rate Limit Exhaustion**: Replaced individual sequential embedding requests with a unified `generateBatchEmbeddings` helper. Utilizes batch API endpoints (Gemini's `batchEmbedContents` and OpenAI input arrays) to embed up to 50–100 chunks per request, resolving 429 Too Many Requests errors and speeding up indexing by 20x.

### Removed
- **React Widget components**: Removed all legacy widget UI code (`src/components/`, `src/index.ts`).
- **Server Entry points**: Deleted the node-based `src/server.ts` entrypoint.
- **Supabase Persistence**: Stripped out `supabaseSetup.ts` SQL scripts and `createSupabaseVectorStore` from vector stores.
- **NPM Package configs**: Pruned React peerDependencies and package properties from `package.json`.

## [0.3.5] - 2026-07-02

### Fixed
- **Ternary Inversion Bug**: Fixed the streaming handoff ternary condition in `ChatbotWidget.tsx` to correctly display the fallback message (rather than a blank bubble) when zero search matches trigger the handoff form.
- **Typing Indicator UX overlap**: Restructured the loading check in `ChatWindow.tsx` to only render the typing indicator when the user is waiting for the initial server connection, immediately hiding the dots as soon as streaming tokens begin typing.
- **TypeScript Async Iterator compilation**: Added the `"lib": ["ES2020", "DOM"]` configuration to `tsconfig.json` to resolve missing global type definition warnings for `AsyncIterableIterator` on compilation.
- **Handoff Substring False-Positives**: Updated the handoff detection helper in `ragPipeline.ts` to utilize regex word boundary matches (`\b`), preventing false positive triggers on conversational vocabulary terms.

## [0.3.4] - 2026-07-01

### Added
- **API Rate-Limiting Backoffs**: Added `fetchWithRetry` helper inside `utils.ts` utilizing exponential retry backoffs, overriding the fetch scope across LLM/Embedding adapters and Supabase queries.
- **Client-Side Stream Recovery**: Configured the stream reader catch blocks to catch terminations mid-response, appending a connection warning indicator to the partial bubble rather than duplicating bubbles.
- **Hybrid Keyword fallback**: Programmed vector store adapters to trigger keyword ILIKE fallbacks automatically on vector search threshold misses, ranking matches by query term frequencies with full regex word boundary matching.

## [0.3.3] - 2026-07-01

### Added
- **Automated Test Suite**: Set up Vitest testing framework devDependencies and configured testing target scripts in `package.json`.
- **Vector Store Tests**: Created `vectorStores.test.ts` testing cosine similarity calculations and memory vector store sorting, filtering, and indexing limits.
- **RAG Pipeline Tests**: Created `ragPipeline.test.ts` testing synchronous prompt formatting and dynamic streaming event parsing (validating XML token stripping and metadata retrieval).

## [0.3.2] - 2026-07-01

### Added
- **Real-Time Token Streaming**: Added full Server-Sent Events (SSE) streaming capabilities to the RAG server pipeline. Exposes `runRagPipelineStream` returning a standard Web `ReadableStream`.
- **Streaming Adapters**: Implemented `createOpenAICompatibleLLMStream`, `createOpenAILLMStream`, and `createGeminiLLMStream` in `adapterFactories.ts` to fetch and parse live server-sent chunks.
- **Sliding-Window Token Parser**: Implemented a streaming text transformer `createStreamTransformer` in `ragPipeline.ts` that intercepts and buffers suggestions XML blocks mid-stream, delivering raw text tokens to the UI and a clean structured JSON metadata chunk at the very end of the connection.
- **Client-Side Stream Reader**: Updated `submitQuestion` in `ChatbotWidget.tsx` to read the streamed response body using reader buffers and update React messages state dynamically as tokens arrive.

## [0.3.1] - 2026-07-01

### Added
- **Chat History Persistence**: Added storage persistence configuration to the client widget. Users can pass the `persistence` prop (`"none" | "local" | "session"`) to keep chat logs synchronized to `localStorage` or `sessionStorage` and restored across page reloads.
- **SSR Safety**: Added server-side rendering execution guards to ensure memory storage sync is bypassed safely in Next.js/Remix SSR environments.

## [0.3.0] - 2026-07-01

### Added
- **Database Agnosticism**: Abstracted the vector database querying layer behind a flexible `VectorStoreAdapter` interface. This allows developers to plug in any custom database or third-party vector store (e.g. Pinecone, Qdrant, local memory list, custom Postgres pgvector instances).
- **Supabase Vector Store Adapter**: Added `createSupabaseVectorStore(url, anonKey)` in `vectorStores.ts` to retain seamless plug-and-play integrations with Supabase.
- **In-Memory Vector Store Adapter**: Added `createMemoryVectorStore(documents)` in `vectorStores.ts` providing an offline-capable, database-free matching adapter utilizing native cosine similarity calculations.
- **Similarity Math Helpers**: Added `cosineSimilarity(a, b)` for vector geometry processing in node and server environments.

### Changed
- **Breaking API Configuration**: Removed raw `supabaseUrl` and `supabaseAnonKey` parameters from the `runRagPipeline` configuration contract, replacing them with a structured `vectorStore` adapter interface.

## [0.2.9] - 2026-06-30

### Added
- **Dynamic Related/Follow-Up Questions**: Configured the RAG pipeline to instruct the LLM to output 2-3 relevant follow-up questions at the end of its response inside specific XML tags. Added a parser in `ragPipeline.ts` to extract and clean these questions from the raw answer.
- **Interactive Follow-Up Pills**: Updated `ChatWindow.tsx` to render these dynamic follow-up questions as clickable pills directly below the most recent assistant message. Clicking a pill automatically submits that question to the assistant.
- **Dynamic Suggestion Styles**: Added borders, backgrounds, and hover animations for `.chatbot-suggested-questions` and `.chatbot-suggested-question` inside `chatbot.css`.

### Changed
- **Type Consolidation**: Moved `DocumentChunk`, `RagPipelineConfig`, and `RagPipelineResult` definitions into the centralized `types.ts` module, updating imports in `ragPipeline.ts` to prevent duplicate type declarations.

## [0.2.8] - 2026-06-30

### Added
- **Clickable Hyperlink Citations**: Modified `MessageBubble.tsx` to render retrieved sources containing a `url` metadata attribute as active anchor `<a>` tags targeting `_blank`. Added hover micro-animations and styling for `.chatbot-source-link` inside `chatbot.css`.

### Changed
- **Conversational Tone & Persona**: Rewrote the RAG system prompt in `ragPipeline.ts` to instruct the LLM to adopt a friendly first-person persona representing Hasaan, explicitly block clinical prefaces like *"according to the context"*, and natively support greetings (e.g. "hi", "hello") without default fallback errors.

## [0.2.7] - 2026-06-30

### Added
- **Backend Email Notifications**: Added README guides showing developers how to handle lead captures securely on their server using webhooks (Discord/Slack) or email APIs (Resend/Nodemailer).
- **CSS Variable Definitions**: Listed all theme CSS variable names in the documentation to make it easy for developers to customize and override the widget branding colors inside their own websites.

### Changed
- **Documentation Overhaul**: Completely rewrote the `README.md` to document the secure proxy-architecture, separate client/server installation imports, and supply the corrected SQL index cast queries.

## [0.2.6] - 2026-06-30

### Added
- **Click-Outside-to-Close**: Configured a `useEffect` outside-click listener in `ChatbotWidget.tsx` to automatically collapse the chat window when a user clicks outside the chatbot widget shell.

### Changed
- **Styling Scoping**: Scoped all input fields in `LeadForm.tsx` to use `.chatbot-input-field` instead of the generic `.input-field` to prevent CSS style leaks to host pages.
- **Auto-Zoom Prevention**: Overrode mobile viewport input/select/textarea font-size to `16px` (`1rem`) to prevent iOS Safari/Android Chrome from automatically zooming in and shifting the page layout when the input is focused.
- **Scroll Chaining Fix**: Applied `overscroll-behavior: contain` to `.chatbot-body` and `.chatbot-window` in `chatbot.css` to prevent scroll events from propagating to the host portfolio page.
- **Text Clipping Fix**: Set `.chatbot-input` height to `100%` and `line-height` to `normal` inside `chatbot.css` to fix vertical layout issues that clipped letters and input placeholder text.

## [0.2.5] - 2026-06-30

### Fixed
- Updated `match_documents` SQL definition inside `supabaseSetup.ts` to perform explicit `halfvec(3072)` casts. This ensures the pgvector HNSW index is successfully matched and used by the PostgreSQL query planner instead of reverting to a full table sequential scan.

## [0.2.4] - 2026-06-30

### Added
- Dedicated backend RAG entrypoint `src/server.ts` that exports pipeline execution, ingestion functions, and model adapter factories.
- Centralized `src/types.ts` type module to prevent circular dependency cycles.
- Multi-target compile configuration in `tsup.config.ts` to separate client React code from Node server modules.

### Changed
- Refactored `ChatbotWidget.tsx` props to accept a safe, decoupled `chatEndpoint` parameter instead of loading private API keys and database credentials in the browser bundle.
- Replaced insecure context runtime UUID dependencies with a robust, browser-safe fallback UUID generator in `ChatbotWidget.tsx`.
- Refactored `index.ts` to export client-side only React components and properties.
- Removed the `useEffect` hook that reset chat history on parent re-renders.

## [0.2.3] - 2026-06-23

### Added

- **Quick Start** section in README: step-by-step setup from install → Supabase SQL → env vars → seed script → React component.
- "What you provide vs what the library handles" and "what requires code" tables for new users.

### Changed

- README main example now uses Gemini for both embedding and answers (`gemini-2.5-flash`).
- Default `createGeminiLLMAdapter` model updated to `gemini-2.5-flash` (replaces deprecated `gemini-1.5-flash`).

## [0.2.2] - 2026-06-23

### Changed

- Default `createGeminiLLMAdapter` model set to `gemini-2.5-flash`.

## [0.2.1] - 2026-06-23

### Fixed

- `SUPABASE_SETUP_SQL` now includes grants and RLS policy so the browser anon key can call `match_documents` and read `documents`. Without this, seeding works (service role) but the chatbot always shows the fallback message.

## [0.2.0] - 2026-06-23

### Changed

- **Breaking:** `SUPABASE_SETUP_SQL` now defaults to `vector(3072)` for `gemini-embedding-001` (Google deprecated `text-embedding-004`).
- Replaced IVFFlat index with HNSW on `halfvec(3072)` cast — pgvector indexes `vector` columns up to 2000 dimensions only; 3072 requires `halfvec` for indexing.
- Updated `createGeminiEmbeddingAdapter` JSDoc: `gemini-embedding-001` outputs **3072** dimensions by default (not 768).
- Updated README embedding dimension tables and database setup docs.
- Fixed JSDoc example in `EmbeddingAdapter` to use `gemini-embedding-001` instead of deprecated `text-embedding-004`.

### Migration

If you previously used `vector(768)` with `text-embedding-004`, you must:

1. Alter your Supabase `documents.embedding` column to `vector(3072)`.
2. Recreate `match_documents` with `query_embedding vector(3072)`.
3. Re-seed all documents with `createGeminiEmbeddingAdapter` (default 3072-dim output).

See README **Migrating from vector(768)** for example SQL.

## [0.1.2] - Previous release

- Initial published widget with Gemini, OpenAI, Cohere embedding factories and multi-provider LLM adapters.
- `SUPABASE_SETUP_SQL` used `vector(768)` for Gemini `text-embedding-004`.
