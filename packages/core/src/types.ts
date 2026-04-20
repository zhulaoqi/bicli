export type AuthContext =
  | { userId: number; role: string }
  | { token: string };

export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolName: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; result: unknown; duration: number }
  | { type: "confirm_request"; toolName: string; action: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done"; fullText: string };

export interface ConfirmRequest {
  toolName: string;
  action: string;
  summary: string;
  level: "destructive" | "warning";
}

export interface EngineStatus {
  connected: boolean;
  model: string;
  role: string;
  toolCount: number;
  permissionCount: number;
}

export interface ToolInfo {
  name: string;
  description: string;
  requiredPermissions?: string[];
}
