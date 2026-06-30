/**
 * Ready-to-run SQL for setting up your Supabase project.
 *
 * IMPORTANT: Change `vector(3072)` to match your embedding model's output size:
 *   - Gemini gemini-embedding-001 (default) → vector(3072)
 *   - Gemini gemini-embedding-001 (768)   → vector(768)  — pass outputDimensionality: 768
 *   - OpenAI text-embedding-3-small         → vector(1536)
 *   - OpenAI text-embedding-3-large       → vector(3072)
 *   - Cohere embed-english-v3.0             → vector(1024)
 *   - Mistral mistral-embed                 → vector(1024)
 *
 * Note: pgvector indexes `vector` columns up to 2000 dims only. For 3072, use HNSW on halfvec (below).
 */
export const SUPABASE_SETUP_SQL = `
-- Enable pgvector
create extension if not exists vector;

-- Documents table (change vector(3072) to match your embedding model)
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(3072),
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

-- HNSW index on halfvec cast (required for dims > 2000; IVFFlat max is 2000)
create index if not exists documents_embedding_idx
  on documents using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- Similarity search function (change vector(3072) to match your model)
create or replace function match_documents(
  query_embedding  vector(3072),
  match_count      int   default 8,
  match_threshold  float default 0.5
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql stable as $$
  select
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Permissions: the chatbot widget uses the anon key in the browser
grant usage on schema public to anon, authenticated;
grant select on public.documents to anon, authenticated;
grant execute on function public.match_documents(vector(3072), int, float) to anon, authenticated;

alter table public.documents enable row level security;

drop policy if exists "Allow public read for RAG" on public.documents;
create policy "Allow public read for RAG"
  on public.documents
  for select
  to anon, authenticated
  using (true);
`;

/**
 * Ingest a single document chunk into Supabase.
 * Call this from a Node.js script or server route — not from the browser in production.
 *
 * @param content    The text content of the chunk
 * @param metadata   Any metadata (title, url, section, etc.)
 * @param embedText  A function that converts text to a vector — pass your EmbeddingAdapter
 * @param supabaseUrl      Your Supabase project URL
 * @param supabaseAnonKey  Your Supabase anon key (or service role key for ingestion scripts)
 */
export async function ingestDocument(
  content: string,
  metadata: Record<string, unknown>,
  embedText: (text: string) => Promise<number[]>,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<void> {
  const embedding = await embedText(content);

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ content, embedding, metadata }),
  });

  if (!response.ok) {
    throw new Error(`Failed to ingest document: ${response.status} ${await response.text()}`);
  }
}