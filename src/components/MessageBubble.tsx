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
            {message.sources.map((source) => {
              const key = `${source.title}-${source.url ?? "source"}`;
              return source.url ? (
                <a
                  key={key}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chatbot-source chatbot-source-link"
                >
                  {source.title}
                </a>
              ) : (
                <span key={key} className="chatbot-source">
                  {source.title}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
