import { streamText, tool as defineTool, jsonSchema, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, ModelMessage, Tool } from "ai";
import { McpHttpClient } from "./mcp-client.js";
import type { ChatEvent, EmbedConfig, SessionInfo, SessionMessage } from "./types.js";

export class EmbedEngine {
  private config: EmbedConfig;
  private mcp: McpHttpClient;
  private messages: ModelMessage[] = [];
  private tools: Record<string, any> = {};
  private toolDefs: Array<{ name: string; description?: string; inputSchema: any; _meta?: Record<string, unknown> }> = [];
  private model: LanguageModel;
  private sessionId: number | null = null;

  constructor(config: EmbedConfig) {
    this.config = config;
    this.mcp = new McpHttpClient(config.mcpEndpoint);
    const provider = createOpenAI({
      baseURL: config.llmConfig.endpoint,
      apiKey: config.llmConfig.apiKey,
    });
    this.model = provider.chat(config.llmConfig.model);
  }

  async initialize(): Promise<{ toolCount: number }> {
    await this.mcp.connect();
    const result = await this.mcp.listTools();
    this.toolDefs = (result.tools || []) as any[];
    this.tools = this.buildTools();
    return { toolCount: this.toolDefs.length };
  }

  async *chat(userInput: string): AsyncGenerator<ChatEvent> {
    this.messages.push({ role: "user", content: userInput } as ModelMessage);

    const toolStartTimes: Record<string, number> = {};
    let fullText = "";

    try {
      const result = streamText({
        model: this.model,
        system: this.buildSystemPrompt(),
        messages: [...this.messages],
        tools: this.tools,
        stopWhen: stepCountIs(this.config.maxTurns || 20),
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            fullText += part.text;
            yield { type: "text_delta", content: part.text };
            break;
          case "tool-call":
            toolStartTimes[part.toolCallId] = Date.now();
            yield { type: "tool_call_start", toolName: part.toolName, args: part.input };
            break;
          case "tool-result": {
            const duration = Date.now() - (toolStartTimes[part.toolCallId] || 0);
            yield { type: "tool_call_end", toolName: part.toolName, result: part.output, duration };
            break;
          }
          case "error":
            yield { type: "error", message: String(part.error) };
            break;
        }
      }

      if (fullText) {
        this.messages.push({ role: "assistant", content: fullText } as ModelMessage);
      }
      yield { type: "done", fullText };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      yield { type: "error", message: msg };
    }
  }

  async saveSession(title?: string): Promise<{ sessionId: number }> {
    const messagesToSave: SessionMessage[] = [];
    for (const m of this.messages) {
      if (typeof m.content === "string") {
        messagesToSave.push({
          role: m.role as SessionMessage["role"],
          content: m.content,
        });
      }
    }
    if (messagesToSave.length === 0) return { sessionId: this.sessionId || 0 };

    const res = await this.mcp.callTool("session_save", {
      sessionId: this.sessionId || undefined,
      title,
      messages: messagesToSave,
      _context: this.buildContext(),
    });
    const text = (res.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.success && parsed.data?.sessionId) {
        this.sessionId = parsed.data.sessionId;
      }
    }
    return { sessionId: this.sessionId || 0 };
  }

  async loadSession(sessionId: number): Promise<SessionMessage[]> {
    const res = await this.mcp.callTool("session_load", {
      sessionId,
      _context: this.buildContext(),
    });
    const text = (res.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!parsed.success) return [];
    this.sessionId = sessionId;
    return parsed.data?.messages || [];
  }

  async listSessions(): Promise<SessionInfo[]> {
    const res = await this.mcp.callTool("session_list", {
      _context: this.buildContext(),
    });
    const text = (res.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    if (!text) return [];
    const parsed = JSON.parse(text);
    return parsed.success ? (parsed.data?.items || []) : [];
  }

  async deleteSession(sessionId: number): Promise<boolean> {
    const res = await this.mcp.callTool("session_delete", {
      sessionId,
      _context: this.buildContext(),
    });
    const text = (res.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    if (!text) return false;
    const parsed = JSON.parse(text);
    return parsed.success === true;
  }

  clearMessages() {
    this.messages = [];
    this.sessionId = null;
  }

  getSessionId(): number | null {
    return this.sessionId;
  }

  getToolCount(): number {
    return this.toolDefs.length;
  }

  async dispose() {
    await this.mcp.disconnect();
  }

  private buildContext(): Record<string, unknown> {
    if (this.config.token) {
      return { token: this.config.token };
    }
    return { userId: this.config.userId, role: this.config.userRole };
  }

  private buildSystemPrompt(): string {
    return [
      `你是一个 AI 助手，嵌入在用户的软件系统中。`,
      `当前用户角色: ${this.config.userRole}`,
      `你可以使用工具来完成用户的请求。`,
      `请用中文回复。`,
    ].join("\n");
  }

  private buildTools(): Record<string, Tool<any, any>> {
    const context = this.buildContext();
    const result: Record<string, Tool<any, any>> = {};

    for (const t of this.toolDefs) {
      const toolName = t.name;
      const schema = (t.inputSchema ?? { type: "object" as const }) as Parameters<typeof jsonSchema>[0];

      result[toolName] = defineTool<any, string>({
        description: t.description || "",
        inputSchema: jsonSchema<any>(schema),
        execute: async (args: any) => {
          const res = await this.mcp.callTool(toolName, { ...args, _context: context });
          const text = (res.content as Array<{ type: string; text?: string }>)
            ?.map((c) => c.text ?? "")
            .join("");
          return text;
        },
      });
    }
    return result;
  }
}
