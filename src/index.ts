import "./styles/chatbot.css";

export { default as ChatbotWidget } from "./components/ChatbotWidget";
export { default as ChatWindow } from "./components/ChatWindow";
export { default as MessageBubble } from "./components/MessageBubble";
export { default as QuickActions } from "./components/QuickActions";
export { default as LeadForm } from "./components/LeadForm";

export type {
  ChatbotWidgetProps,
  ChatMessage,
  ChatSource,
  LeadFormValues,
  LeadFormConfig,
} from "./types";
