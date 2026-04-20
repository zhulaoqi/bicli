export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolName: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; result: unknown; duration: number }
  | { type: "error"; message: string }
  | { type: "done"; fullText: string };

export interface EmbedConfig {
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
  maxTurns?: number;
}

export interface SessionInfo {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  durationMs?: number;
}
