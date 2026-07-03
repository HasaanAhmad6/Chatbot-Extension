import {
  createGeminiLLMAdapter,
  createOpenAILLMAdapter,
  createAnthropicLLMAdapter,
  createDeepSeekLLMAdapter,
  createGroqLLMAdapter,
  createOllamaLLMAdapter,
  createOpenAICompatibleLLMAdapter
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
    embeddingModel: "text-embedding-3-small",
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
const btnReindex = document.getElementById("btn-reindex") as HTMLButtonElement;

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
    checkIndexState();
  });
});

settingsToggle.addEventListener("click", () => {
  switchView("settings");
});

btnReindex.addEventListener("click", () => {
  if (confirm(`Are you sure you want to re-crawl and re-map ${currentDomain}? This will clear the local cache.`)) {
    const directoryKey = `directory:${currentDomain}`;
    chrome.storage.local.remove([directoryKey], () => {
      chatMessagesContainer.innerHTML = "";
      checkIndexState();
    });
  }
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

// Check index directory status or active crawls
async function checkIndexState() {
  const settings = await chrome.storage.local.get(["setupCompleted", "provider", "apiKey"]);
  if (!settings.setupCompleted) {
    switchView("settings");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
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
      showSystemMessage("Agentic Website Explorer cannot run on browser settings or system pages.");
      switchView("chat");
      return;
    }

    chatDomainLabel.textContent = currentDomain;

    // Check active indexing in background
    chrome.runtime.sendMessage({
      type: "GET_CRAWL_STATUS",
      data: { domain: currentDomain }
    }, (status) => {
      if (status && (status.status === "crawling" || status.status === "embedding")) {
        updateIndexingProgress(status);
        switchView("indexing");
      } else {
        const directoryKey = `directory:${currentDomain}`;
        chrome.storage.local.get([directoryKey], (res) => {
          const directory = res[directoryKey];
          if (directory && (Date.now() - directory.timestamp < 86400000)) {
            renderReadyChat(directory.pages.length);
          } else {
            renderIndexingPrompt();
          }
        });
      }
    });

  } catch (err) {
    console.error("Directory status check failed:", err);
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
    <h3 class="card-title" style="margin-bottom: 8px;">Map Website Structure</h3>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.4;">
      Build a lightweight directory of this website's pages (URLs, titles, headings) to enable agentic exploration.
    </p>
    <button class="btn" id="btn-start-crawl">Map Domain Now</button>
  `;
  chatMessagesContainer.appendChild(card);
  switchView("chat");

  const startCrawlBtn = document.getElementById("btn-start-crawl");
  if (startCrawlBtn) {
    startCrawlBtn.addEventListener("click", () => {
      const origin = new URL(currentUrl).origin + "/*";
      chrome.permissions.request({
        origins: [origin]
      }, (granted) => {
        if (granted) {
          chrome.runtime.sendMessage({
            type: "START_CRAWL",
            data: { domain: currentDomain, url: currentUrl }
          }, () => {
            switchView("indexing");
          });
        } else {
          alert("Host permissions are required to map this website.");
        }
      });
    });
  }
}

function renderReadyChat(pageCount: number) {
  chatMessagesContainer.innerHTML = "";
  showSystemMessage(`Ready to explore. Mapped ${pageCount} pages locally. Ask a question and the AI agent will retrieve the best pages!`);
  
  chatInput.disabled = false;
  btnSendMessage.disabled = false;
  chatInput.placeholder = "Ask about this site...";
  switchView("chat");
}

function updateIndexingProgress(state: any) {
  indexingState.textContent = "Mapping Site Structure";
  indexingSub.textContent = state.message;

  const percentage = state.total > 0 ? Math.round((state.progress / state.total) * 100) : 0;
  indexingProgressBar.style.width = `${percentage}%`;
  indexingPercentage.textContent = `${percentage}%`;
  indexingCount.textContent = `${state.progress} / ${state.total} pages`;
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
        <h3 class="card-title" style="color: #ff453a;">Mapping Failed</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">${state.message}</p>
        <button class="btn" id="btn-crawl-retry">Retry mapping</button>
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

// Initialize LLM adapter on demand
async function getLLMAdapter() {
  const settings = await chrome.storage.local.get(["provider", "apiKey", "model"]);
  const { provider, apiKey, model } = settings;

  if (provider === "gemini") {
    return createGeminiLLMAdapter(apiKey, model || "gemini-2.5-flash");
  } else if (provider === "openai") {
    return createOpenAILLMAdapter(apiKey, model || "gpt-4o-mini");
  } else if (provider === "anthropic") {
    return createAnthropicLLMAdapter(apiKey, model || "claude-3-5-sonnet-20241022");
  } else if (provider === "deepseek") {
    return createDeepSeekLLMAdapter(apiKey, model || "deepseek-chat");
  } else if (provider === "groq") {
    return createGroqLLMAdapter(apiKey, model || "llama3-8b-8192");
  } else if (provider === "ollama") {
    return createOllamaLLMAdapter(model || "llama3");
  } else {
    return createOpenAICompatibleLLMAdapter({
      apiKey,
      baseUrl: provider === "cohere" ? "https://api.cohere.com" : "https://api.openai.com",
      model: model || "gpt-4o-mini"
    });
  }
}

async function submitMessage() {
  const query = chatInput.value.trim();
  if (!query) return;

  chatInput.value = "";
  appendMessage("user", query);
  
  const typingEl = appendTypingIndicator();
  updateTypingText(typingEl, "Analyzing request...");

  try {
    const settings = await chrome.storage.local.get(["provider", "apiKey"]);
    const { provider, apiKey } = settings;

    if (!apiKey && provider !== "ollama") {
      throw new Error("Missing API key. Please configure your settings.");
    }

    // 1. Fetch site directory
    const directoryKey = `directory:${currentDomain}`;
    const directoryRes = await chrome.storage.local.get([directoryKey]);
    const directory = directoryRes[directoryKey];

    if (!directory || !Array.isArray(directory.pages) || directory.pages.length === 0) {
      throw new Error("Site map is missing. Please re-index this website.");
    }

    // 2. Select matching pages (LLM Link Router)
    updateTypingText(typingEl, "Selecting relevant pages to read...");
    const llm = await getLLMAdapter();

    const pagesListSummary = directory.pages.map((p: any, idx: number) => {
      return `ID: ${idx}\nURL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\nHeadings: ${p.headings.join(", ")}`;
    }).join("\n\n---\n\n");

    const routerSystemPrompt = `You are a link router agent representing the website ${currentDomain}.
Your job is to look at the list of available pages below and select the top 2 or 3 pages (URLs) that are most likely to contain the answer to the user's question.

Guidelines:
1. Return ONLY a valid JSON array containing the selected URLs, for example: ["https://example.com/page1", "https://example.com/page2"]
2. Do not explain your choice. Output ONLY the JSON array.
3. If no page seems relevant, return an empty array: []

Available Pages:
${pagesListSummary}`;

    const routerResponse = await llm({
      question: query,
      systemPrompt: routerSystemPrompt,
      conversation: []
    });

    let selectedUrls: string[] = [];
    try {
      const jsonMatch = routerResponse.answer.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        selectedUrls = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn("Failed to parse router selection, falling back to keyword search:", e);
    }

    // Fallback: If AI Router fails or returns nothing, fall back to home page or simple keyword matching
    if (selectedUrls.length === 0) {
      // Find pages containing query words in title/headings
      const queryWords = query.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2);
      const matches = directory.pages.filter((p: any) => {
        const titleMatch = queryWords.some(w => p.title.toLowerCase().includes(w));
        const headMatch = queryWords.some(w => p.headings.some((h: string) => h.toLowerCase().includes(w)));
        return titleMatch || headMatch;
      });
      selectedUrls = matches.slice(0, 3).map((m: any) => m.url);
      
      // Ultimate fallback: homepage
      if (selectedUrls.length === 0) {
        selectedUrls = [currentUrl];
      }
    }

    // 3. Fetch content for selected pages & utilize cache
    const retrievedPages: Array<{ url: string; title: string; text: string }> = [];

    for (const url of selectedUrls) {
      const cacheKey = `cache:${url}`;
      const cacheRes = await chrome.storage.local.get([cacheKey]);
      const cachedData = cacheRes[cacheKey];

      // Cache expires after 24 hours
      if (cachedData && (Date.now() - cachedData.timestamp < 86400000)) {
        retrievedPages.push({
          url,
          title: cachedData.title,
          text: cachedData.text
        });
      } else {
        // Fetch fresh text in background
        updateTypingText(typingEl, `Reading: ${new URL(url).pathname}...`);
        const fetchResult = await chrome.runtime.sendMessage({
          type: "FETCH_PAGE",
          data: { url }
        });

        if (fetchResult && fetchResult.success) {
          retrievedPages.push({
            url,
            title: fetchResult.title,
            text: fetchResult.text
          });

          // Save page text cache locally
          await chrome.storage.local.set({
            [cacheKey]: {
              url,
              title: fetchResult.title,
              text: fetchResult.text,
              timestamp: Date.now()
            }
          });
        }
      }
    }

    if (retrievedPages.length === 0) {
      throw new Error("Unable to load content from the chosen website pages.");
    }

    // 4. Synthesize final response (LLM Answer Generator)
    updateTypingText(typingEl, "Synthesizing answer...");

    const contextContext = retrievedPages.map((page, idx) => {
      // Limit page text length to prevent TPM (Tokens Per Minute) limit exhaustion on Gemini Free Tier
      const cleanText = page.text.length > 12000
        ? page.text.slice(0, 12000) + "\n... [Content truncated to prevent rate limit limits] ..."
        : page.text;

      return `[Source ${idx + 1}]
URL: ${page.url}
Title: ${page.title}
Content:
${cleanText}`;
    }).join("\n\n---\n\n");

    const generatorSystemPrompt = `You are a friendly, helpful website assistant representing ${currentDomain}. 
Answer the user's questions naturally, conversationally, and in the first person.

Guidelines:
1. Answer using ONLY the website content provided below. Do NOT make up, guess, or hallucinate facts that are not present.
2. If the context does not contain enough information to answer, reply politely explaining that you do not have that specific information.
3. Cite the source URLs from the context in your responses when providing factual details.
4. Avoid robotic framing phrases (do NOT start with 'Based on the context...', 'According to the website...', etc.). Just speak directly.

Website Content:
${contextContext}`;

    const answerResponse = await llm({
      question: query,
      systemPrompt: generatorSystemPrompt,
      conversation: chatHistory
    });

    typingEl.remove();

    // Map source formats
    const sources = retrievedPages.map(page => ({
      title: page.title,
      url: page.url
    }));

    appendMessage("assistant", answerResponse.answer, sources);

    // Save history
    chatHistory.push({ role: "user", content: query });
    chatHistory.push({ role: "assistant", content: answerResponse.answer });
    if (chatHistory.length > 10) {
      chatHistory = chatHistory.slice(-10);
    }

  } catch (err) {
    console.error("RAG pipeline failed:", err);
    typingEl.remove();
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("429")) {
      appendMessage("assistant", "I hit the Gemini API rate limit (HTTP 429). This happens on Gemini's Free Tier when asking multiple questions quickly or if the website content is very large. Please wait 10–15 seconds and try again!");
    } else {
      appendMessage("assistant", `Sorry, I encountered an error: ${errMsg}`);
    }
  }
}

// Message Rendering Helpers
function appendMessage(role: "user" | "assistant" | "system", content: string, sources?: any[]) {
  const container = document.createElement("div");
  container.className = `message ${role}`;

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

  chatMessagesContainer.appendChild(container);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function appendTypingIndicator() {
  const container = document.createElement("div");
  container.className = "message assistant typing-indicator";
  container.innerHTML = `
    <span class="typing-text" style="font-size: 0.8rem; color: var(--text-muted); margin-right: 8px;">Thinking...</span>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatMessagesContainer.appendChild(container);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  return container;
}

function updateTypingText(indicator: HTMLDivElement, text: string) {
  const textEl = indicator.querySelector(".typing-text");
  if (textEl) {
    textEl.textContent = text;
  }
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

    const event = new Event("change");
    selectProvider.dispatchEvent(event);

    checkIndexState();
  });

  // Track tab changes
  chrome.tabs.onActivated.addListener(() => {
    checkIndexState();
  });

  // Track tab URL updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      checkIndexState();
    }
  });
});
