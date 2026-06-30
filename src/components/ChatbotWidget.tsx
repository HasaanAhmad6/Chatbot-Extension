"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ChatWindow } from "./ChatWindow";
import { LeadForm, defaultLeadFormConfig } from "./LeadForm";
import type {
  ChatMessage,
  ConversationTurn,
  LeadFormConfig,
  LeadFormValues,
  ChatbotWidgetProps,
} from "../types";

const defaultWelcomeMsg =
  "Hi! I'm here to help. Ask me anything or pick one of the quick actions below.";

const defaultFallbackMsg =
  "I don't have enough information to answer that. Would you like to connect with our team?";

const defaultQuickActions = [
  "View Services",
  "View Case Studies",
  "Get a Quote",
  "Book a Free Consultation",
  "Contact Us",
  "Talk to Human Support",
];

const defaultBotName = "AI Assistant";
const defaultBotEyebrow = "Support";
const defaultToggleLabel = "Chat with us";
const defaultInputPlaceholder = "Type your message...";
const defaultChatEndpoint = "/api/chat";

function safeUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createInitialMessage(welcomeMsg: string): ChatMessage {
  return {
    id: safeUUID(),
    role: "assistant",
    content: welcomeMsg,
  };
}

function buildConversation(messages: ChatMessage[]): ConversationTurn[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export default function ChatbotWidget({
  chatEndpoint = defaultChatEndpoint,
  botName = defaultBotName,
  botEyebrow = defaultBotEyebrow,
  toggleLabel = defaultToggleLabel,
  inputPlaceholder = defaultInputPlaceholder,
  welcomeMsg = defaultWelcomeMsg,
  theme = "light",
  quickActions = defaultQuickActions,
  fallbackMsg = defaultFallbackMsg,
  leadFormConfig,
  onLeadSubmit,
  leadEndpoint,
}: ChatbotWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createInitialMessage(welcomeMsg)]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leadFormOpen, setLeadFormOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Set the initial message once or when welcomeMsg is explicitly changed,
  // but do not reset the entire conversation history.
  useEffect(() => {
    setMessages((current) => {
      if (current.length <= 1) {
        return [createInitialMessage(welcomeMsg)];
      }
      return current;
    });
  }, [welcomeMsg]);

  const quickActionList = useMemo(() => quickActions.filter((action) => action.trim().length > 0), [quickActions]);
  const resolvedLeadFormConfig = useMemo(() => ({ ...defaultLeadFormConfig, ...leadFormConfig }), [leadFormConfig]);

  function getSourcePage() {
    return typeof window !== "undefined" ? window.location.pathname : "/";
  }

  async function submitQuestion(question: string) {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) {
      return;
    }

    const nextUserMessage: ChatMessage = {
      id: safeUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    setMessages((current) => [...current, nextUserMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmedQuestion,
          conversation: buildConversation([...messages, nextUserMessage]),
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const result = await response.json();

      const assistantMessage: ChatMessage = {
        id: safeUUID(),
        role: "assistant",
        content: result.answer || fallbackMsg,
        needsHumanHandoff: result.needsHumanHandoff,
        sources: result.sources,
      };

      setMessages((current) => [...current, assistantMessage]);

      if (assistantMessage.needsHumanHandoff) {
        setLeadFormOpen(true);
      }
    } catch (err) {
      console.error("[ChatbotWidget Error]", err);
      setMessages((current) => [
        ...current,
        {
          id: safeUUID(),
          role: "assistant",
          content: fallbackMsg,
          needsHumanHandoff: true,
        },
      ]);
      setLeadFormOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(action: string) {
    void submitQuestion(action);
  }

  async function submitLead(values: LeadFormValues) {
    if (leadEndpoint) {
      const response = await fetch(leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Unable to submit lead.");
      }
    } else if (onLeadSubmit) {
      await onLeadSubmit(values);
    }

    setLeadFormOpen(false);
    setMessages((current) => [
      ...current,
      {
        id: safeUUID(),
        role: "assistant",
        content: "Thanks! Your details have been received. Someone will be in touch with you shortly.",
      },
    ]);
  }

  const leadForm = leadFormOpen ? (
    <LeadForm
      sourcePage={getSourcePage()}
      config={resolvedLeadFormConfig}
      onCancel={() => setLeadFormOpen(false)}
      onSubmit={submitLead}
    />
  ) : null;

  return (
    <div ref={containerRef} className={`chatbot-widget-shell chatbot-theme-${theme}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="chatbot-toggle"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        <span className="chatbot-toggle-icon" aria-hidden="true">
          <span className="chatbot-toggle-dot" />
        </span>
        <span className="chatbot-toggle-label">{toggleLabel}</span>
        <span className="chatbot-toggle-spark" aria-hidden="true">✦</span>
      </button>

      <ChatWindow
        open={open}
        messages={messages}
        quickActions={quickActionList}
        input={input}
        botName={botName}
        botEyebrow={botEyebrow}
        inputPlaceholder={inputPlaceholder}
        loading={loading}
        onClose={() => setOpen(false)}
        onInputChange={setInput}
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuestion(input);
        }}
        onQuickAction={handleQuickAction}
      >
        {leadForm}
      </ChatWindow>
    </div>
  );
}
