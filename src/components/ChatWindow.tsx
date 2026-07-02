"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { QuickActions } from "./QuickActions";

type ChatWindowProps = {
  open: boolean;
  messages: ChatMessage[];
  quickActions: string[];
  input: string;
  botName: string;
  botEyebrow: string;
  inputPlaceholder: string;
  loading: boolean;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onQuickAction: (action: string) => void;
  children?: React.ReactNode;
};

export function ChatWindow({
  open,
  messages,
  quickActions,
  input,
  botName,
  botEyebrow,
  inputPlaceholder,
  loading,
  onClose,
  onInputChange,
  onSubmit,
  onQuickAction,
  children,
}: ChatWindowProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !bodyRef.current) {
      return;
    }

    bodyRef.current.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [open, messages.length, loading, children]);

  return (
    <div className={`chatbot-window ${open ? "chatbot-window-open" : "chatbot-window-closed"}`}>
      <div className="chatbot-header">
        <div className="chatbot-header-glow" />
        <div className="chatbot-header-content">
          <div>
            <p className="chatbot-eyebrow">{botEyebrow}</p>
            <h2 className="chatbot-heading">{botName}</h2>
          </div>
          <button type="button" onClick={onClose} className="chatbot-close">
            Close
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="chatbot-scrollbar chatbot-body">
        <QuickActions actions={quickActions} onAction={onQuickAction} />

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {loading && messages[messages.length - 1]?.role === "user" && <TypingIndicator />}

        {!loading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].suggestedQuestions && (
          <div className="chatbot-suggested-questions">
            {messages[messages.length - 1].suggestedQuestions!.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onQuickAction(question)}
                className="chatbot-suggested-question"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {children}
      </div>

      <form onSubmit={onSubmit} className="chatbot-form">
        <div className="chatbot-input-shell">
          <input
            name="chat-message"
            aria-label="Type your message"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={inputPlaceholder}
            className="chatbot-input"
          />
          <button type="submit" disabled={loading || !input.trim()} className="chatbot-send">
            {loading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chatbot-message-row chatbot-message-row-assistant">
      <div className="chatbot-message chatbot-message-assistant chatbot-typing" aria-live="polite" aria-label="Assistant is typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default ChatWindow;
