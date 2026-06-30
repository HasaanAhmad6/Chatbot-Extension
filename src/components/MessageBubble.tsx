import type { ChatMessage } from "../types";

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`chatbot-message-row ${isUser ? "chatbot-message-row-user" : "chatbot-message-row-assistant"}`}>
      <div className={`chatbot-message ${isUser ? "chatbot-message-user" : "chatbot-message-assistant"}`}>
        <p className="chatbot-message-text">{message.content}</p>
        {message.sources && message.sources.length > 0 && !isUser && (
          <div className="chatbot-sources">
            {message.sources.map((source) => (
              <span key={`${source.title}-${source.url ?? "source"}`} className="chatbot-source">
                {source.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
