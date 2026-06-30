# @hasaan_6/rag-chatbot-widget

## What This Is

A React chatbot widget with a built-in RAG pipeline. You bring your own embedding provider, your own LLM provider, and a Supabase database with your content. The library wires the pipeline together and renders the chat UI.

## How It Works

The runtime flow is:

1. The user asks a question in the widget.
2. The library sends the text to your `EmbeddingAdapter`.
3. The resulting vector is used to query Supabase via `match_documents`.
4. The top matching chunks are assembled into a system prompt and conversation context.
5. The library sends that context to your `LLMAdapter`.
6. The answer, sources, and handoff signal are returned to the UI.

The library owns the pipeline and the UI. You own the AI providers.

## Supported Providers

| Role | Built-in factory | Works via generic factory |
| --- | --- | --- |
| Embedding | Gemini, OpenAI, Cohere | Any HTTP API |
| LLM | DeepSeek, OpenAI, Groq, Mistral, Together, Ollama, Anthropic, Gemini | Any OpenAI-compatible API |

## Prerequisites

- A Supabase project with `pgvector` enabled
- An embedding API key from any supported provider
- An LLM API key from any supported provider

## Database Setup

The helpers export ready-to-run SQL:

```tsx
import { SUPABASE_SETUP_SQL } from "@hasaan_6/rag-chatbot-widget";

console.log(SUPABASE_SETUP_SQL);
```

**Important:** the SQL uses `vector(3072)` for the default Gemini adapter (`gemini-embedding-001`). Change that dimension to match your embedding model before creating the table and `match_documents` function.

| Provider & model | Dimensions |
| --- | --- |
| Gemini gemini-embedding-001 (default) | 3072 |
| Gemini gemini-embedding-001 (with `outputDimensionality: 768`) | 768 |
| OpenAI text-embedding-3-small | 1536 |
| OpenAI text-embedding-3-large | 3072 |
| Cohere embed-english-v3.0 | 1024 |
| Mistral mistral-embed | 1024 |

## Installation

```bash
npm install @hasaan_6/rag-chatbot-widget
```

## Usage Examples

### Minimal: Gemini embedding + DeepSeek LLM

```tsx
import {
  ChatbotWidget,
  createGeminiEmbeddingAdapter,
  createDeepSeekLLMAdapter,
} from "rag-chatbot-widget";
import "@hasaan_6/rag-chatbot-widget/dist/chatbot.css";

export default function App() {
  return (
    <ChatbotWidget
      embeddingAdapter={createGeminiEmbeddingAdapter("YOUR_GEMINI_KEY")}
      llmAdapter={createDeepSeekLLMAdapter("YOUR_DEEPSEEK_KEY")}
      supabaseUrl="https://yourproject.supabase.co"
      supabaseAnonKey="YOUR_SUPABASE_ANON_KEY"
      botName="Acme Assistant"
      toggleLabel="Chat with us"
      welcomeMsg="Hi! Ask me anything about our products."
    />
  );
}
```

### OpenAI for both

```tsx
<ChatbotWidget
  embeddingAdapter={createOpenAIEmbeddingAdapter("YOUR_OPENAI_KEY")}
  llmAdapter={createOpenAILLMAdapter("YOUR_OPENAI_KEY", "gpt-4o-mini")}
  supabaseUrl="..."
  supabaseAnonKey="..."
/>
```

### Custom adapters

```tsx
import type { EmbeddingAdapter, LLMAdapter } from "@hasaan_6/rag-chatbot-widget";

const myEmbedding: EmbeddingAdapter = async (text) => {
  return [/* call any API and return number[] */];
};

const myLLM: LLMAdapter = async ({ systemPrompt, question, conversation }) => {
  return { answer: "..." };
};
```

### Custom lead form

```tsx
<ChatbotWidget
  ...
  leadFormConfig={{
    serviceOptions: ["Consulting", "Training", "Custom Build"],
    budgetOptions: ["< $5k", "$5k-$20k", "$20k+"],
    contactTimeOptions: ["This week", "This month", "Flexible"],
    leadKicker: "Tell us about your project",
  }}
  leadEndpoint="/api/leads"
/>
```

## Props Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `embeddingAdapter` | `EmbeddingAdapter` | required | Converts the user question into an embedding vector. |
| `llmAdapter` | `LLMAdapter` | required | Generates the answer from the retrieved context. |
| `supabaseUrl` | `string` | required | Your Supabase project URL. |
| `supabaseAnonKey` | `string` | required | Your Supabase anon/public key. |
| `matchCount` | `number` | `8` | Number of document chunks to retrieve. |
| `matchThreshold` | `number` | `0.5` | Minimum similarity threshold. |
| `conversationWindow` | `number` | `6` | Number of recent conversation turns to include. |
| `botName` | `string` | `AI Assistant` | Heading shown in the chat window. |
| `botEyebrow` | `string` | `Support` | Small eyebrow label above the heading. |
| `toggleLabel` | `string` | `Chat with us` | Visible label on the floating toggle button. |
| `inputPlaceholder` | `string` | `Type your message...` | Placeholder shown in the input box. |
| `welcomeMsg` | `string` | `Hi! I'm here to help. Ask me anything or pick one of the quick actions below.` | Initial assistant message. |
| `theme` | `"light" \| "dark"` | `light` | Chooses the surface palette. |
| `quickActions` | `string[]` | preset list | Quick action buttons shown above the messages. |
| `fallbackMsg` | `string` | `I don't have enough information to answer that. Would you like to connect with our team?` | Message shown when the pipeline cannot answer. |
| `leadFormConfig` | `LeadFormConfig` | merged defaults | Controls lead form dropdowns and field visibility. |
| `onLeadSubmit` | `(values: LeadFormValues) => Promise<void>` | undefined | Local submit handler when no lead endpoint is set. |
| `leadEndpoint` | `string` | undefined | Optional POST endpoint for lead submission. |

## Embedding Dimension Reference

| Provider & Model | Dimensions |
| --- | --- |
| Gemini gemini-embedding-001 (default) | 3072 |
| Gemini gemini-embedding-001 (with `outputDimensionality: 768`) | 768 |
| OpenAI text-embedding-3-small | 1536 |
| OpenAI text-embedding-3-large | 3072 |
| Cohere embed-english-v3.0 | 1024 |
| Mistral mistral-embed | 1024 |

## Theming

The widget uses CSS variables for styling. Override them in your app to match your brand:

```css
:root {
  --chatbot-primary: #6366f1;
  --chatbot-primary-strong: #4f46e5;
  --chatbot-secondary: #111827;
  --chatbot-bg: #ffffff;
  --chatbot-surface: #f9fafb;
  --chatbot-text: #111827;
  --chatbot-muted: rgba(17, 24, 39, 0.62);
  --chatbot-border: rgba(17, 24, 39, 0.12);
  --chatbot-danger: #b91c1c;
  --chatbot-danger-bg: #fef2f2;
  --chatbot-border-radius: 12px;
}
```

Set `theme="dark"` to switch the widget to a dark surface palette.

## Security Note

API keys passed as props are exposed in the browser bundle. For production, proxy requests through a server-side route such as a Next.js route handler or Express endpoint, then write a custom adapter that calls your proxy instead of the provider directly. That keeps secrets server-side.

## Build

```bash
npm run build
```

The build writes compiled JavaScript, declaration files, and a copied `chatbot.css` file into `dist/`.
