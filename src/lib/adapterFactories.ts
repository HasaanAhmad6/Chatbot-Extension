import type { EmbeddingAdapter, LLMAdapter, LLMStreamAdapter, LLMAdapterInput, ConversationTurn } from "./adapters";
import { fetchWithRetry } from "./utils";

const fetch = fetchWithRetry;

/** Gemini gemini-embedding-001 (3072 dimensions by default; supports outputDimensionality 128–3072) */
export function createGeminiEmbeddingAdapter(apiKey: string): EmbeddingAdapter {
  return async (text) => {
    const response = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini embedding failed: ${response.status}`);
    const data = await response.json();
    return data.embedding.values as number[];
  };
}

/** OpenAI text-embedding-3-small (1536 dimensions) or text-embedding-3-large (3072 dimensions) */
export function createOpenAIEmbeddingAdapter(apiKey: string, model = "text-embedding-3-small"): EmbeddingAdapter {
  return async (text) => {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(`OpenAI embedding failed: ${response.status}`);
    const data = await response.json();
    return data.data[0].embedding as number[];
  };
}

/** Cohere embed-english-v3.0 or embed-multilingual-v3.0 (1024 dimensions) */
export function createCohereEmbeddingAdapter(apiKey: string, model = "embed-english-v3.0"): EmbeddingAdapter {
  return async (text) => {
    const response = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        texts: [text],
        input_type: "search_query",
        embedding_types: ["float"],
      }),
    });
    if (!response.ok) throw new Error(`Cohere embedding failed: ${response.status}`);
    const data = await response.json();
    return data.embeddings.float[0] as number[];
  };
}

/**
 * Generic OpenAI-compatible factory.
 * Works for: OpenAI, DeepSeek, Groq, Together AI, Perplexity, Mistral, Ollama, and any
 * other provider that follows the POST /v1/chat/completions interface.
 */
export function createOpenAICompatibleLLMAdapter(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}): LLMAdapter {
  const { apiKey, baseUrl, model, temperature = 0.3, maxTokens = 1024 } = config;

  return async ({ systemPrompt, question, conversation }) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversation,
          { role: "user", content: question },
        ],
      }),
    });
    if (!response.ok) {
      try {
        const errData = await response.json();
        throw new Error(`API Error: ${errData.error?.message || errData.error?.status || `Status ${response.status}`}`);
      } catch {
        throw new Error(`LLM request failed: ${response.status}`);
      }
    }
    const data = await response.json();
    return { answer: (data.choices[0]?.message?.content ?? "").trim() };
  };
}

export const createDeepSeekLLMAdapter = (apiKey: string, model = "deepseek-chat") =>
  createOpenAICompatibleLLMAdapter({ apiKey, baseUrl: "https://api.deepseek.com", model });

export const createOpenAILLMAdapter = (apiKey: string, model = "gpt-4o-mini") =>
  createOpenAICompatibleLLMAdapter({ apiKey, baseUrl: "https://api.openai.com", model });

export const createGroqLLMAdapter = (apiKey: string, model = "llama3-8b-8192") =>
  createOpenAICompatibleLLMAdapter({ apiKey, baseUrl: "https://api.groq.com/openai", model });

export const createMistralLLMAdapter = (apiKey: string, model = "mistral-small-latest") =>
  createOpenAICompatibleLLMAdapter({ apiKey, baseUrl: "https://api.mistral.ai", model });

export const createTogetherLLMAdapter = (apiKey: string, model: string) =>
  createOpenAICompatibleLLMAdapter({ apiKey, baseUrl: "https://api.together.xyz", model });

export const createOllamaLLMAdapter = (model: string, baseUrl = "http://localhost:11434") =>
  createOpenAICompatibleLLMAdapter({ apiKey: "ollama", baseUrl, model });

/** Anthropic Claude — separate implementation because the API format differs */
export function createAnthropicLLMAdapter(apiKey: string, model = "claude-3-5-haiku-20241022"): LLMAdapter {
  return async ({ systemPrompt, question, conversation }) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [...conversation.map((turn) => ({ role: turn.role, content: turn.content })), { role: "user", content: question }],
      }),
    });
    if (!response.ok) {
      try {
        const errData = await response.json();
        throw new Error(`Anthropic API Error: ${errData.error?.message || errData.error?.type || `Status ${response.status}`}`);
      } catch {
        throw new Error(`Anthropic request failed: ${response.status}`);
      }
    }
    const data = await response.json();
    return { answer: (data.content[0]?.text ?? "").trim() };
  };
}

/** Google Gemini generateContent */
export function createGeminiLLMAdapter(apiKey: string, model = "gemini-2.5-flash"): LLMAdapter {
  return async ({ systemPrompt, question, conversation }) => {
    const contents = [
      ...conversation.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );
    if (!response.ok) {
      try {
        const errData = await response.json();
        throw new Error(`Gemini API Error: ${errData.error?.message || errData.error?.status || `Status ${response.status}`}`);
      } catch {
        throw new Error(`Gemini LLM request failed: ${response.status}`);
      }
    }
    const data = await response.json();
    return { answer: (data.candidates[0]?.content?.parts[0]?.text ?? "").trim() };
  };
}

async function* readChunks(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      yield line;
    }
  }
  if (buffer) yield buffer;
}

export function createOpenAICompatibleLLMStream(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}): LLMStreamAdapter {
  const { apiKey, baseUrl, model, temperature = 0.3, maxTokens = 1024 } = config;

  return async ({ systemPrompt, question, conversation }: LLMAdapterInput) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversation,
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) throw new Error(`LLM stream failed: ${response.status}`);
    const reader = response.body!.getReader();

    return new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const line of readChunks(reader)) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data: ")) continue;
            const dataStr = cleanLine.slice(6);
            if (dataStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(dataStr);
              const text = parsed.choices[0]?.delta?.content || "";
              if (text) {
                controller.enqueue(text);
              }
            } catch (err) {
              // ignore parse errors
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });
  };
}

export const createOpenAILLMStream = (apiKey: string, model = "gpt-4o-mini") =>
  createOpenAICompatibleLLMStream({ apiKey, baseUrl: "https://api.openai.com", model });

export function createGeminiLLMStream(apiKey: string, model = "gemini-2.5-flash"): LLMStreamAdapter {
  return async ({ systemPrompt, question, conversation }: LLMAdapterInput) => {
    const contents = [
      ...conversation.map((turn: ConversationTurn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );

    if (!response.ok) throw new Error(`Gemini stream failed: ${response.status}`);
    const reader = response.body!.getReader();

    return new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const line of readChunks(reader)) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data: ")) continue;
            const dataStr = cleanLine.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              const text = parsed.candidates[0]?.content?.parts[0]?.text || "";
              if (text) {
                controller.enqueue(text);
              }
            } catch (err) {
              // ignore parse errors
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });
  };
}