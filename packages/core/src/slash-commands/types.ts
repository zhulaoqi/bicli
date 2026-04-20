import type { ModelDisplayInfo } from "../model-registry/types.js";

export interface SlashCommand {
  name: string;
  args: string[];
  raw: string;
}

export interface SkillSummary {
  name: string;
  title: string;
  description: string;
  triggers: string[];
  requiredPermissions: string[];
}

export interface UserInfo {
  id: number;
  username: string;
  role: string;
  status: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export type SlashCommandResult =
  | { type: "model_list"; models: ModelDisplayInfo[]; current: string }
  | { type: "model_switched"; from: string; to: ModelDisplayInfo }
  | { type: "model_add_guide"; platform: "tui" | "web"; template?: string }
  | { type: "model_removed"; id: string }
  | { type: "role_info"; role: string; permissions: string[]; availableTools: string[] }
  | { type: "tools_list"; tools: Array<{ name: string; description: string }> }
  | { type: "cleared" }
  | { type: "help"; commands: Array<{ command: string; description: string }> }
  | { type: "skill_list"; skills: SkillSummary[] }
  | { type: "skill_created"; name: string; path: string }
  | { type: "skill_create_guide"; template: string }
  | { type: "user_list"; users: UserInfo[]; currentUserId: number }
  | { type: "user_switched"; from: UserInfo; to: UserInfo; permissions: string[] }
  | { type: "session_list"; sessions: SessionSummary[]; currentId: string }
  | { type: "session_saved"; id: string; title: string }
  | { type: "session_title_set"; title: string }
  | { type: "error"; message: string };
