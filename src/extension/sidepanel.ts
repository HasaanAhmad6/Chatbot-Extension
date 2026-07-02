import { 
  runRagPipeline, 
  runRagPipelineStream 
} from "../lib/ragPipeline";
import { 
  createChromeStorageVectorStore 
} from "../lib/vectorStores";
import {
  createGeminiEmbeddingAdapter,
  createOpenAIEmbeddingAdapter,
  createCohereEmbeddingAdapter,
  createGeminiLLMAdapter,
  createOpenAILLMAdapter,
  createAnthropicLLMAdapter,
  createDeepSeekLLMAdapter,
  createGroqLLMAdapter,
  createCohereEmbeddingAdapter as createCohereLLMAdapter, // wait, cohere llm is openai compatible
  createOpenAICompatibleLLMAdapter,
  createOllamaLLMAdapter
} from "../lib/adapterFactories";
import type { ConversationTurn, ChatMessage } from "../types";

// State
let currentDomain = "";
let currentUrl = "";
let chatHistory: ConversationTurn[] = [];

// Provider configurations
const PROVIDER_DEFAULTS: Record<string, { model: string; embeddingModel: string; keyLabel: string }> = {
  gemini: {
    model: "gemini-2.5-flash",
    embeddingModel: "gemini-embedding-001",
    keyLabel: "Gemini API Key",
  },
  openai: {
    model: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    keyLabel: "OpenAI API Key",
  },
  cohere: {
    model: "command-r-plus",
    embeddingModel: "embed-english-v3.0",
    keyLabel: "Cohere API Key",
  },
  deepseek: {
    model: "deepseek-chat",
    embeddingModel: "text-embedding-3-small", // DeepSeek has no embed API; default to OpenAI style
    keyLabel: "DeepSeek API Key",
  },
  groq: {
    model: "llama3-8b-8192",
    embeddingModel: "text-embedding-3-small",
    keyLabel: "Groq API Key",
  },
  anthropic: {
    model: "claude-3-5-sonnet-20241022",
    embeddingModel: "text-embedding-3-small",
    keyLabel: "Anthropic API Key",
  },
  ollama: {
    model: "llama3",
    embeddingModel: "nomic-embed-text",
    keyLabel: "Not required (Ollama running locally)",
  },
};

// DOM Elements
const selectProvider = document.getElementById("select-provider") as HTMLSelectElement;
const inputApiKey = document.getElementById("input-api-key") as HTMLInputElement;
const inputModel = document.getElementById("input-model") as HTMLInputElement;
const inputEmbeddingModel = document.getElementById("input-embedding-model") as HTMLInputElement;
const btnSaveSettings = document.getElementById("btn-save-settings") as HTMLButtonElement;
const settingsToggle = document.getElementById("settings-toggle") as HTMLButtonElement;

const viewSettings = document.getElementById("view-settings") as HTMLDivElement;
const viewIndexing = document.getElementById("view-indexing") as HTMLDivElement;
const viewChat = document.getElementById("view-chat") as HTMLDivElement;

const indexingState = document.getElementById("indexing-state") as HTMLDivElement;
const indexingSub = document.getElementById("indexing-sub") as HTMLDivElement;
const indexingProgressBar = document.getElementById("indexing-progress-bar") as HTMLDivElement;
const indexingCount = document.getElementById("indexing-count") as HTMLSpanElement;
const indexingPercentage = document.getElementById("indexing-percentage") as HTMLSpanElement;

const chatDomainLabel = document.getElementById("chat-domain-label") as HTMLDivElement;
const chatMessagesContainer = document.getElementById("chat-messages-container") as HTMLDivElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const btnSendMessage = document.getElementById("btn-send-message") as HTMLButtonElement;

// Show/hide credentials group based on provider
selectProvider.addEventListener("change", () => {
  const provider = selectProvider.value;
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults) {
    inputModel.value = defaults.model;
    inputEmbeddingModel.value = defaults.embeddingModel;
    
    const keyLabel = document.querySelector("#group-api-key label") as HTMLLabelElement;
    if (keyLabel) keyLabel.textContent = defaults.keyLabel;

    if (provider === "ollama") {
      inputApiKey.value = "ollama";
      inputApiKey.disabled = true;
    } else {
      inputApiKey.disabled = false;
      chrome.storage.local.get([`${provider}_apiKey`], (res) => {
        inputApiKey.value = res[`${provider}_apiKey`] || "";
      });
    }
  }
});

// Save settings handler
btnSaveSettings.addEventListener("click", () => {
  const provider = selectProvider.value;
  const apiKey = inputApiKey.value.trim();
  const model = inputModel.value.trim();
  const embeddingModel = inputEmbeddingModel.value.trim();

  if (!apiKey && provider !== "ollama") {
    alert("Please enter a valid API key.");
    return;
  }

  chrome.storage.local.set({
    provider,
    apiKey,
    [`${provider}_apiKey`]: apiKey,
    model,
    embeddingModel,
    setupCompleted: true,
  }, () => {
    // Determine next step
    checkIndexState();
  });
});

settingsToggle.addEventListener("click", () => {
  switchView("settings");
});

function switchView(view: "settings" | "indexing" | "chat") {
  viewSettings.classList.remove("active");
  viewIndexing.classList.remove("active");
  viewChat.classList.remove("active");

  if (view === "settings") {
    viewSettings.classList.add("active");
  } else if (view === "indexing") {
    viewIndexing.classList.add("active");
  } else if (view === "chat") {
    viewChat.classList.add("active");
  }
}

// Check index cache state or active crawls
async function checkIndexState() {
  // Retrieve settings
  const settings = await chrome.storage.local.get(["setupCompleted", "provider", "apiKey"]);
  if (!settings.setupCompleted) {
    switchView("settings");
    return;
  }

  // Get active tab details
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    showSystemMessage("Unable to retrieve tab details. Please refresh the page.");
    switchView("chat");
    return;
  }

  try {
    currentUrl = tab.url;
    const urlObj = new URL(tab.url);
    currentDomain = urlObj.hostname;

    if (!currentDomain || urlObj.protocol.startsWith("chrome")) {
      showSystemMessage("RAG Site Explorer cannot run on browser settings or system pages.");
      switchView("chat");
      return;
    }

    chatDomainLabel.textContent = currentDomain;

    // Check if currently indexing in background
    chrome.runtime.sendMessage({
      type: "GET_CRAWL_STATUS",
      data: { domain: currentDomain }
    }, (status) => {
      if (status && (status.status === "crawling" || status.status === "embedding")) {
        updateIndexingProgress(status);
        switchView("indexing");
      } else {
        // Check local cache
        const indexKey = `index:${currentDomain}`;
        chrome.storage.local.get([indexKey], (res) => {
          const index = res[indexKey];
          // Check freshness (24h = 86400000ms)
          if (index && (Date.now() - index.timestamp < 86400000)) {
            renderReadyChat(index.pageCount, index.chunks.length);
          } else {
            renderIndexingPrompt();
          }
        });
      }
    });

  } catch (err) {
    console.error("Index check failed:", err);
    showSystemMessage("Error parsing page origin. Make sure you are on a public website.");
    switchView("chat");
  }
}

function renderIndexingPrompt() {
  chatMessagesContainer.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.style.textAlign = "center";
  card.innerHTML = `
    <h3 class="card-title" style="margin-bottom: 8px;">Index Website Content</h3>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.4;">
      This website has not been indexed yet. Let's crawl its pages and build a local knowledge base.
    </p>
    <button class="btn" id="btn-start-crawl">Index Domain Now</button>
  `;
  chatMessagesContainer.appendChild(card);
  switchView("chat");

  const startCrawlBtn = document.getElementById("btn-start-crawl");
  if (startCrawlBtn) {
    startCrawlBtn.addEventListener("click", () => {
      // Request optional host permission
      const origin = new URL(currentUrl).origin + "/*";
      chrome.permissions.request({
        origins: [origin]
      }, (granted) => {
        if (granted) {
          // Trigger crawl via background worker
          chrome.runtime.sendMessage({
            type: "START_CRAWL",
            data: { domain: currentDomain, url: currentUrl }
          }, () => {
            switchView("indexing");
          });
        } else {
          alert("Host permissions are required to crawl and index this website.");
        }
      });
    });
  }
}

function renderReadyChat(pageCount: number, chunkCount: number) {
  chatMessagesContainer.innerHTML = "";
  showSystemMessage(`Loaded cached index. Found ${pageCount} pages (${chunkCount} context vectors) cached locally.`);
  
  // Enable input
  chatInput.disabled = false;
  btnSendMessage.disabled = false;
  chatInput.placeholder = "Ask about this site...";
  switchView("chat");
}

function updateIndexingProgress(state: any) {
  indexingState.textContent = state.status === "crawling" ? "Crawling Content Pages" : "Generating Vector Index";
  indexingSub.textContent = state.message;

  const percentage = state.total > 0 ? Math.round((state.progress / state.total) * 100) : 0;
  indexingProgressBar.style.width = `${percentage}%`;
  indexingPercentage.textContent = `${percentage}%`;
  indexingCount.textContent = `${state.progress} / ${state.total} ${state.status === "crawling" ? 'pages' : 'vectors'}`;
}

// Listen for updates from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CRAWL_STATUS_UPDATE") {
    const state = message.data;
    if (state.domain !== currentDomain) return;

    if (state.status === "completed") {
      checkIndexState();
    } else if (state.status === "error") {
      chatMessagesContainer.innerHTML = "";
      const card = document.createElement("div");
      card.className = "card";
      card.style.borderLeft = "3px solid #ff3b30";
      card.innerHTML = `
        <h3 class="card-title" style="color: #ff453a;">Indexing Failed</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">${state.message}</p>
        <button class="btn" id="btn-crawl-retry">Retry Indexing</button>
      `;
      chatMessagesContainer.appendChild(card);
      switchView("chat");

      document.getElementById("btn-crawl-retry")?.addEventListener("click", () => {
        checkIndexState();
      });
    } else {
      updateIndexingProgress(state);
    }
  }
});

// Chat logic
btnSendMessage.addEventListener("click", submitMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitMessage();
  }
});

async function submitMessage() {
  const query = chatInput.value.trim();
  if (!query) return;

  chatInput.value = "";
  appendMessage("user", query);
  
  const typingEl = appendTypingIndicator();
  
  try {
    const settings = await chrome.storage.local.get(["provider", "apiKey", "model", "embeddingModel"]);
    const { provider, apiKey, model, embeddingModel } = settings;

    // 1. Build Embedding Adapter
    let embeddingAdapter;
    if (provider === "gemini") {
      embeddingAdapter = createGeminiEmbeddingAdapter(apiKey);
    } else if (provider === "openai") {
      embeddingAdapter = createOpenAIEmbeddingAdapter(apiKey, embeddingModel || "text-embedding-3-small");
    } else if (provider === "cohere") {
      embeddingAdapter = createCohereEmbeddingAdapter(apiKey, embeddingModel || "embed-english-v3.0");
    } else {
      embeddingAdapter = createGeminiEmbeddingAdapter(apiKey);
    }

    // 2. Build LLM Adapter
    let llmAdapter;
    if (provider === "gemini") {
      llmAdapter = createGeminiLLMAdapter(apiKey, model || "gemini-2.5-flash");
    } else if (provider === "openai") {
      llmAdapter = createOpenAILLMAdapter(apiKey, model || "gpt-4o-mini");
    } else if (provider === "anthropic") {
      llmAdapter = createAnthropicLLMAdapter(apiKey, model || "claude-3-5-sonnet-20241022");
    } else if (provider === "deepseek") {
      llmAdapter = createDeepSeekLLMAdapter(apiKey, model || "deepseek-chat");
    } else if (provider === "groq") {
      llmAdapter = createGroqLLMAdapter(apiKey, model || "llama3-8b-8192");
    } else if (provider === "ollama") {
      llmAdapter = createOllamaLLMAdapter(model || "llama3");
    } else {
      // General OpenAI Compatible fallback
      llmAdapter = createOpenAICompatibleLLMAdapter({
        apiKey,
        baseUrl: provider === "cohere" ? "https://api.cohere.com" : "https://api.openai.com",
        model: model || "gpt-4o-mini"
      });
    }

    // 3. Build Vector Store
    const vectorStore = createChromeStorageVectorStore(currentDomain);

    // Hardcoded thresholds based on provider
    const threshold = provider === "gemini" ? 0.4 : 0.35;

    // 4. Run RAG Pipeline
    const pipelineResult = await runRagPipeline(query, chatHistory, {
      embeddingAdapter,
      llmAdapter,
      vectorStore,
      matchCount: 6,
      matchThreshold: threshold,
    });

    typingEl.remove();

    // 5. Hallucination Guard Check
    if (!pipelineResult.answer && pipelineResult.needsHumanHandoff) {
      appendMessage("assistant", "I couldn't find anything about that on this site.");
    } else {
      appendMessage("assistant", pipelineResult.answer, pipelineResult.sources, pipelineResult.suggestedQuestions);
      chatHistory.push({ role: "user", content: query });
      chatHistory.push({ role: "assistant", content: pipelineResult.answer });
      // Cap history window
      if (chatHistory.length > 12) {
        chatHistory = chatHistory.slice(-12);
      }
    }

  } catch (err) {
    console.error("RAG execution failed:", err);
    typingEl.remove();
    appendMessage("assistant", `Sorry, I encountered an error answering your question: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Message Rendering Helpers
function appendMessage(role: "user" | "assistant" | "system", content: string, sources?: any[], suggestions?: string[]) {
  const container = document.createElement("div");
  container.className = `message ${role}`;

  // Process text paragraphs safely
  const textContainer = document.createElement("div");
  textContainer.textContent = content;
  textContainer.style.whiteSpace = "pre-wrap";
  container.appendChild(textContainer);

  // Render sources
  if (sources && sources.length > 0) {
    const sourcesDiv = document.createElement("div");
    sourcesDiv.className = "sources-list";
    
    const title = document.createElement("div");
    title.className = "source-title";
    title.textContent = "Sources:";
    sourcesDiv.appendChild(title);

    // De-duplicate urls
    const uniqueSources = new Map<string, string>();
    for (const src of sources) {
      if (src.url) {
        uniqueSources.set(src.url, src.title || src.url);
      }
    }

    uniqueSources.forEach((titleText, url) => {
      const a = document.createElement("a");
      a.className = "source-link";
      a.href = url;
      a.target = "_blank";
      a.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points='15 3 21 3 21 9'></polyline><line x1='10' y1='14' x2='21' y2='3'></line></svg>
        ${titleText}
      `;
      sourcesDiv.appendChild(a);
    });
    
    container.appendChild(sourcesDiv);
  }

  // Render suggestions
  if (suggestions && suggestions.length > 0) {
    const suggsDiv = document.createElement("div");
    suggsDiv.className = "suggestions-list";
    
    for (const sug of suggestions) {
      const btn = document.createElement("button");
      btn.className = "suggestion-pill";
      btn.textContent = sug;
      btn.addEventListener("click", () => {
        chatInput.value = sug;
        submitMessage();
      });
      suggsDiv.appendChild(btn);
    }
    
    container.appendChild(suggsDiv);
  }

  chatMessagesContainer.appendChild(container);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function appendTypingIndicator() {
  const container = document.createElement("div");
  container.className = "message assistant typing-indicator";
  container.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatMessagesContainer.appendChild(container);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  return container;
}

function showSystemMessage(text: string) {
  appendMessage("system", text);
}

// Initialise
document.addEventListener("DOMContentLoaded", () => {
  // Populate settings from storage if they exist
  chrome.storage.local.get(["provider", "apiKey", "model", "embeddingModel"], (res) => {
    if (res.provider) selectProvider.value = res.provider;
    
    const defaults = PROVIDER_DEFAULTS[selectProvider.value];
    
    if (res.apiKey) inputApiKey.value = res.apiKey;
    inputModel.value = res.model || defaults?.model || "";
    inputEmbeddingModel.value = res.embeddingModel || defaults?.embeddingModel || "";

    // Trigger changes if provider has specialized fields
    const event = new Event("change");
    selectProvider.dispatchEvent(event);

    checkIndexState();
  });
});
