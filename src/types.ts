export type ChatRole = "user" | "assistant";

export type ChatSource = {
  title: string;
  url?: string | null;
  similarity?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  needsHumanHandoff?: boolean;
  suggestedQuestions?: string[];
};

export type LeadFormValues = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  requiredService: string;
  budget: string;
  projectDetails: string;
  preferredContactTime: string;
  sourcePage: string;
  honeypot: string;
  submittedAt: number;
};

export type LeadFormConfig = {
  serviceOptions?: string[];
  budgetOptions?: string[];
  contactTimeOptions?: string[];
  showCompanyField?: boolean;
  showPhoneField?: boolean;
  leadKicker?: string;
};

export type ChatbotWidgetProps = {
  chatEndpoint?: string;
  botName?: string;
  botEyebrow?: string;
  toggleLabel?: string;
  inputPlaceholder?: string;
  welcomeMsg?: string;
  theme?: "light" | "dark";
  quickActions?: string[];
  fallbackMsg?: string;
  leadFormConfig?: LeadFormConfig;
  onLeadSubmit?: (values: LeadFormValues) => Promise<void>;
  leadEndpoint?: string;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type LLMAdapterInput = {
  question: string;
  context: string;
  conversation: ConversationTurn[];
  systemPrompt: string;
};

export type LLMAdapterOutput = {
  answer: string;
  needsHumanHandoff?: boolean;
  suggestedQuestions?: string[];
};

export type EmbeddingAdapter = (text: string) => Promise<number[]>;
export type LLMAdapter = (input: LLMAdapterInput) => Promise<LLMAdapterOutput>;

export type DocumentChunk = {
  id: string;
  content: string;
  metadata: {
    title?: string;
    url?: string;
    [key: string]: unknown;
  };
  similarity: number;
};

export type VectorStoreAdapter = (
  embedding: number[],
  options: { matchCount: number; matchThreshold: number }
) => Promise<DocumentChunk[]>;

export type RagPipelineConfig = {
  embeddingAdapter: EmbeddingAdapter;
  llmAdapter: LLMAdapter;
  vectorStore: VectorStoreAdapter;
  matchCount?: number;
  matchThreshold?: number;
  conversationWindow?: number;
};

export type RagPipelineResult = {
  answer: string;
  sources: Array<{ title: string; url?: string; similarity: number }>;
  needsHumanHandoff: boolean;
  suggestedQuestions?: string[];
};
