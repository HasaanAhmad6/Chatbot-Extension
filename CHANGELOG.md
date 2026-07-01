# Changelog

All notable changes to `@hasaan_6/rag-chatbot-widget` are documented in this file.

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
