# @hasaan_6/rag-chatbot-widget

A secure, production-grade, self-contained React chatbot widget with a server-side Retrieval-Augmented Generation (RAG) pipeline. Decouples client-side UI rendering from server-side database lookups and API provider logic.

---

## Features

*   **🔒 Secure by Design**: Zero API keys or database credentials are shipped to the client's browser. All RAG logic runs securely on your server.
*   **⚡ High Performance**: Optimized vector querying that casts inputs to PostgreSQL HNSW indexes (`halfvec(3072)`) for O(log N) similarity search speed.
*   **📱 Responsive & Fluid UX**: Mobile viewport auto-zoom prevention, scroll-chaining protection, click-outside-to-close behavior, and vertical alignment fixes.
*   **🛠 Swapable Provider Adapters**: Decoupled interface wrappers for Gemini, OpenAI, Cohere, Anthropic, Mistral, Groq, Together AI, and Ollama.
*   **📋 Multi-step Lead Form**: Built-in bot-resistant lead collection form with spam honeypots to capture user interest and project details.

---

## Installation

```bash
npm install @hasaan_6/rag-chatbot-widget
```

---

## Database Setup

Run the following SQL script in your Supabase SQL editor to create the `documents` table, enable `pgvector`, build the HNSW index, and create the similarity search function:

```sql
-- Enable pgvector
create extension if not exists vector;

-- Documents table (change vector(3072) to match your embedding model dimensions)
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(3072),
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

-- HNSW index on halfvec cast (required for vector dimensions > 2000)
create index if not exists documents_embedding_idx
  on documents using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- Similarity search function
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
    1 - ((embedding::halfvec(3072)) <=> (query_embedding::halfvec(3072))) as similarity
  from documents
  where 1 - ((embedding::halfvec(3072)) <=> (query_embedding::halfvec(3072))) > match_threshold
  order by (embedding::halfvec(3072)) <=> (query_embedding::halfvec(3072))
  limit match_count;
$$;

-- Permissions: the chatbot widget API calls this function securely
grant usage on schema public to anon, authenticated;
grant select on public.documents to anon, authenticated;
grant execute on function public.match_documents(vector(3072), int, float) to anon, authenticated;

alter table public.documents enable row level security;

create policy "Allow public read for RAG"
  on public.documents
  for select
  to anon, authenticated
  using (true);
```

---

## Usage Examples

This library uses a secure **client-server proxy architecture**. The client React widget communicates with your backend endpoint (e.g. `/api/chat`), which runs the RAG pipeline securely using environment secrets.

### 1. The Frontend (Client-side)

Render the floating widget anywhere on your website. Pass the URL of your backend API route:

```tsx
import { ChatbotWidget } from "@hasaan_6/rag-chatbot-widget";
import "@hasaan_6/rag-chatbot-widget/dist/chatbot.css";

export default function App() {
  return (
    <div className="my-portfolio-page">
      {/* Your site structure */}
      <ChatbotWidget 
        chatEndpoint="/api/chat" 
        botName="Hasaan Assistant"
        welcomeMsg="Hi! Ask me anything about Hasaan's projects or experience."
      />
    </div>
  );
}
```

### 2. The Backend API Route (Server-side)

Implement a POST endpoint on your server that imports the RAG pipeline and provider factories.

#### Next.js (App Router: `app/api/chat/route.ts`)
```typescript
import { NextResponse } from "next/server";
import { 
  runRagPipeline, 
  createGeminiEmbeddingAdapter, 
  createGeminiLLMAdapter 
} from "@hasaan_6/rag-chatbot-widget/server";

export async function POST(req: Request) {
  try {
    const { question, conversation } = await req.json();

    // RAG pipeline executes securely on the server
    const result = await runRagPipeline(question, conversation, {
      embeddingAdapter: createGeminiEmbeddingAdapter(process.env.GEMINI_API_KEY!),
      llmAdapter: createGeminiLLMAdapter(process.env.GEMINI_API_KEY!),
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseAnonKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service key bypasses RLS safely
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Chat API Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

#### Node.js & Express (`server.js`)
```javascript
const express = require('express');
const { 
  runRagPipeline, 
  createGeminiEmbeddingAdapter, 
  createGeminiLLMAdapter 
} = require('@hasaan_6/rag-chatbot-widget/server');

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { question, conversation } = req.body;

    const result = await runRagPipeline(question, conversation, {
      embeddingAdapter: createGeminiEmbeddingAdapter(process.env.GEMINI_API_KEY),
      llmAdapter: createGeminiLLMAdapter(process.env.GEMINI_API_KEY),
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    res.json(result);
  } catch (error) {
    console.error("[Chat Server Error]:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000);
```

---

## Document Ingestion

To populate your database with document chunks, run an ingestion script from your backend workspace. Pass your server-side database service keys:

```typescript
import { ingestDocument, createGeminiEmbeddingAdapter } from "@hasaan_6/rag-chatbot-widget/server";

const embedText = createGeminiEmbeddingAdapter(process.env.GEMINI_API_KEY!);

async function seed() {
  await ingestDocument(
    "Hasaan is a Computer Science undergraduate at UCP. He has hands-on experience with React, Node.js, and Machine Learning.",
    { title: "Skills and Expertise", url: "https://myportfolio.com/about" },
    embedText,
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  console.log("Ingested chunk successfully!");
}

seed();
```

---

## Custom Lead Form Notifications

When a user fills out the contact lead form in the widget, the widget calls your configured `leadEndpoint` (via a POST request) or executes your custom `onLeadSubmit` handler.

You can notify yourself instantly (e.g. by sending an email or posting to a Discord/Slack channel) from your backend.

### Next.js API Route example sending lead email notifications (using Resend)
```typescript
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const lead = await req.json();

    await resend.emails.send({
      from: "portfolio-chatbot@yourdomain.com",
      to: "your-email@domain.com",
      subject: `New Lead Captured: ${lead.name} (${lead.companyName})`,
      html: `
        <h3>Contact Request Received</h3>
        <p><strong>Name:</strong> ${lead.name}</p>
        <p><strong>Email:</strong> ${lead.email}</p>
        <p><strong>Phone:</strong> ${lead.phone}</p>
        <p><strong>Service Requested:</strong> ${lead.requiredService}</p>
        <p><strong>Budget:</strong> ${lead.budget}</p>
        <p><strong>Details:</strong> ${lead.projectDetails}</p>
        <p><strong>Preferred contact time:</strong> ${lead.preferredContactTime}</p>
        <p><strong>Source Page:</strong> ${lead.sourcePage}</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead email alert failed:", error);
    return NextResponse.json({ error: "Failed to process lead" }, { status: 500 });
  }
}
```

---

## Real-Time Token Streaming (SSE)

To enable live token typing (similar to ChatGPT) instead of waiting for the full response to load, pass `stream={true}` to the frontend widget:

```tsx
<ChatbotWidget chatEndpoint="/api/chat" stream={true} />
```

On your backend, use `runRagPipelineStream` combined with streaming adapter factories:

```typescript
import { 
  runRagPipelineStream, 
  createGeminiEmbeddingAdapter, 
  createGeminiLLMStream 
} from "@hasaan_6/rag-chatbot-widget/server";

export async function POST(req: Request) {
  const { question, conversation } = await req.json();

  const stream = await runRagPipelineStream(question, conversation, {
    embeddingAdapter: createGeminiEmbeddingAdapter(process.env.GEMINI_API_KEY!),
    llmStreamAdapter: createGeminiLLMStream(process.env.GEMINI_API_KEY!),
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseAnonKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

> [!NOTE]
> Streaming is currently supported on compatible adapter factories: `createOpenAICompatibleLLMStream`, `createOpenAILLMStream`, and `createGeminiLLMStream` (including Ollama, DeepSeek, Together, Groq, Mistral).
> 
> Anthropic and Cohere currently only support non-streaming execution. If you use `createAnthropicLLMAdapter` or `createCohereLLMAdapter` on your backend, do not set `stream={true}` on the frontend widget.

---

## Props Reference

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `chatEndpoint` | `string` | `"/api/chat"` | The backend API URL that executes the RAG pipeline. |
| `botName` | `string` | `"AI Assistant"` | Main heading shown inside the chat window. |
| `botEyebrow` | `string` | `"Support"` | Small uppercase eyebrow label above the heading. |
| `toggleLabel` | `string` | `"Chat with us"` | Label text shown on the floating float button. |
| `inputPlaceholder`| `string` | `"Type your message..."`| Text shown in the empty input box. |
| `welcomeMsg` | `string` | *preset greeting* | The initial greeting message from the assistant. |
| `theme` | `"light" \| "dark"` | `"light"` | Base style theme class. |
| `quickActions` | `string[]` | *preset actions* | Quick click buttons displayed above chat history. |
| `fallbackMsg` | `string` | *preset fallback* | Response shown when the bot cannot locate information. |
| `leadFormConfig` | `LeadFormConfig` | *merged default* | Custom service options, budget ranges, and kicks. |
| `onLeadSubmit` | `Function` | `undefined` | Callback function executed on local lead form submit. |
| `leadEndpoint` | `string` | `undefined` | Server URL to POST the captured lead values JSON. |
| `persistence` | `"none" \| "local" \| "session"` | `"none"` | Automatically saves and restores conversation history from the browser storage. |
| `stream` | `boolean` | `false` | Enables Server-Sent Events (SSE) token streaming. (Requires streaming backend adapters). |

---

## Custom Styling & Theming

The widget CSS uses custom CSS custom properties (variables). You can override these in your portfolio's stylesheet to completely match your brand colors:

```css
:root {
  --chatbot-primary: #6366f1;         /* Primary brand color (buttons, borders) */
  --chatbot-primary-strong: #4f46e5;  /* Strong active color (button hovers) */
  --chatbot-secondary: #111827;       /* Dark text / user message background */
  --chatbot-bg: #ffffff;              /* Main card background */
  --chatbot-surface: #f9fafb;         /* Inputs and cards background */
  --chatbot-text: #111827;            /* Base text color */
  --chatbot-muted: rgba(17, 24, 39, 0.62); /* Muted labels and placeholders */
  --chatbot-border: rgba(17, 24, 39, 0.12); /* Subtle divider borders */
  --chatbot-border-radius: 16px;      /* Layout border radius scale */
}
```

---

## License

MIT © Hasaan Ahmad
