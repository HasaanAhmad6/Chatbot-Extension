# Changelog

All notable changes to `@hasaan_6/rag-chatbot-widget` are documented in this file.

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
