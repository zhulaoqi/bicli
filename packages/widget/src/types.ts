export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCall?: string;
}

export interface BiCLIChatProps {
  mcpEndpoint: string;
  llmProvider?: "custom";
  llmConfig: {
    endpoint: string;
    model: string;
    apiKey: string;
  };
  userId: number;
  userRole: string;
  token?: string;
  theme?: "dark" | "light";
  maxTurns?: number;
  welcomeMessage?: string;
  style?: React.CSSProperties;
}
