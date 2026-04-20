import { streamText, tool as defineTool, jsonSchema, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage, Tool } from "ai";
import { loadAllSkills } from "@bicli/skills";
import { join } from "node:path";
import { ConfigManager } from "./config/manager.js";
import type { BiCliConfig } from "./config/manager.js";
import { ModelRegistry } from "./model-registry/index.js";
import type { ModelEntry } from "./model-registry/types.js";
import { createModel } from "./llm/provider.js";
import type { ExtendedProvider } from "./llm/provider.js";
import { Session } from "./llm/session.js";
import { ToolCaller } from "./llm/tool-caller.js";
import { McpConnection } from "./mcp-client/connection.js";
import { SkillMatcher } from "./skill-loader/matcher.js";
import { buildSystemPrompt, filterTools } from "./skill-loader/injector.js";
import { PermissionResolver } from "./permissions/resolver.js";
import { filterToolsByPermission } from "./permissions/tool-filter.js";
import type { ToolWithMeta } from "./permissions/tool-filter.js";
import { parseSlashCommand, isSlashCommand } from "./slash-commands/parser.js";
import { handleSlashCommand } from "./slash-commands/handler.js";
import type { SlashCommandContext } from "./slash-commands/handler.js";
import type { ChatEvent, EngineStatus, ToolInfo, ConfirmRequest } from "./types.js";
import type { SlashCommandResult } from "./slash-commands/types.js";
import { SessionPersister } from "./storage/session-persister.js";

export interface TransportConfig {
  command: string;
  args: string[];
}

export interface EngineOptions {
  mcpConnection?: McpConnection;
  onDispose?: () => void;
  platform?: "tui" | "web";
  skillsDir?: string;
  mcpServerPath?: string;
  transport?: TransportConfig;
  contextOverride?: Record<string, unknown>;
}

export class BiCLIEngine {
  private config: BiCliConfig;
  private modelRegistry: ModelRegistry;
  private session: Session;
  private mcp: McpConnection;
  private skillMatcher: SkillMatcher | null = null;
  private permissionResolver: PermissionResolver | null = null;
  private allTools: ToolWithMeta[] = [];
  private ownsMcp: boolean;
  private onDispose?: () => void;
  private platform: "tui" | "web";
  private skillsDir: string;
  private mcpServerPath: string;
  private transport?: TransportConfig;
  private contextOverride?: Record<string, unknown>;
  private initialized = false;
  private confirmHandler?: (req: ConfirmRequest) => Promise<boolean>;
  private persister: SessionPersister;

  constructor(options: EngineOptions = {}) {
    const configManager = new ConfigManager();
    this.config = configManager.load();
    this.modelRegistry = new ModelRegistry();
    this.persister = new SessionPersister();
    this.session = new Session(this.config.session.maxTurns, this.persister);
    this.platform = options.platform || "tui";
    this.skillsDir = options.skillsDir || join(process.cwd(), "packages", "skills", "definitions");
    this.mcpServerPath = options.mcpServerPath || join(process.cwd(), "packages", "mcp-server", "src", "index.ts");
    this.transport = options.transport;
    this.contextOverride = options.contextOverride;

    if (options.mcpConnection) {
      this.mcp = options.mcpConnection;
      this.ownsMcp = false;
    } else {
      this.mcp = new McpConnection();
      this.ownsMcp = true;
    }
    this.onDispose = options.onDispose;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.ownsMcp) {
      const cmd = this.transport?.command ?? "tsx";
      const args = this.transport?.args ?? [this.mcpServerPath];
      await this.mcp.connect(cmd, args);
    }

    const skills = loadAllSkills(this.skillsDir);
    this.skillMatcher = new SkillMatcher(skills);

    const toolsResult = await this.mcp.getClient().listTools();
    this.allTools = (toolsResult.tools || []) as ToolWithMeta[];

    await this.resolveUserId();

    const resolverContext = this.contextOverride
      ?? (this.config.auth?.token ? { token: this.config.auth.token } : undefined);
    this.permissionResolver = new PermissionResolver(
      this.mcp,
      this.config.user.userId,
      this.config.user.role,
      resolverContext,
    );
    try {
      await this.permissionResolver.initialize();
    } catch (err) {
      console.error(
        "[BiCLIEngine] Permission resolver init failed, using empty permissions:",
        err instanceof Error ? err.message : err,
      );
    }

    this.initialized = true;
  }

  async *chat(userInput: string): AsyncGenerator<ChatEvent> {
    if (!this.initialized) throw new Error("Engine not initialized");

    if (isSlashCommand(userInput)) {
      const cmd = parseSlashCommand(userInput);
      if (cmd) {
        const result = await this.executeSlashCommand(cmd.raw);
        yield { type: "done", fullText: JSON.stringify(result) };
        return;
      }
    }

    const permissions = this.permissionResolver!.getPermissions();
    const role = this.config.user.role;

    const matchedSkill = this.skillMatcher!.match(userInput, permissions);

    let visibleTools = filterToolsByPermission(this.allTools, permissions);
    visibleTools = filterTools(visibleTools, matchedSkill) as ToolWithMeta[];

    const systemPrompt = buildSystemPrompt(matchedSkill, role, permissions);

    this.session.addMessage({ role: "user", content: userInput } as ModelMessage);

    const contextPayload: Record<string, unknown> = this.contextOverride
      ?? (this.config.auth?.token
        ? { token: this.config.auth.token }
        : { userId: this.config.user.userId, role });

    const aiTools = this.buildAiTools(visibleTools, contextPayload);
    const currentModel = this.modelRegistry.getCurrent();
    const model = this.resolveModel(currentModel);

    let fullText = "";
    const toolStartTimes: Record<string, number> = {};

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: this.session.getMessages(),
        tools: aiTools,
        stopWhen: stepCountIs(this.config.session.maxTurns),
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            fullText += part.text;
            yield { type: "text_delta", content: part.text } as ChatEvent;
            break;
          case "tool-call":
            toolStartTimes[part.toolCallId] = Date.now();
            this.session.recordToolCall(part.toolName, part.input);
            yield {
              type: "tool_call_start",
              toolName: part.toolName,
              args: part.input,
            } as ChatEvent;
            break;
          case "tool-result": {
            const duration = Date.now() - (toolStartTimes[part.toolCallId] || 0);
            this.session.recordToolResult(part.toolName, part.output, duration);
            yield {
              type: "tool_call_end",
              toolName: part.toolName,
              result: part.output,
              duration,
            } as ChatEvent;
            break;
          }
          case "error":
            yield { type: "error", message: String(part.error) } as ChatEvent;
            break;
        }
      }

      if (fullText) {
        this.session.addMessage({
          role: "assistant",
          content: fullText,
        } as ModelMessage);
      }
      yield { type: "done", fullText } as ChatEvent;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      yield { type: "error", message } as ChatEvent;
    }
  }

  async executeSlashCommand(input: string): Promise<SlashCommandResult> {
    const cmd = parseSlashCommand(input);
    if (!cmd) return { type: "error", message: "无效的命令" };

    const ctx: SlashCommandContext = {
      modelRegistry: this.modelRegistry,
      session: this.session,
      role: this.config.user.role,
      permissions: this.permissionResolver?.getPermissions() || [],
      availableTools: this.getAvailableTools(),
      platform: this.platform,
      skills: this.skillMatcher ? this.getLoadedSkills() : [],
      skillsDir: this.skillsDir,
      currentUserId: this.config.user.userId,
      persister: this.persister,
      refreshPermissions: async () => {
        return this.permissionResolver!.refresh();
      },
      listUsers: () => this.mcpListUsers(),
      switchUser: (userId: number) => this.switchToUser(userId),
    };

    return handleSlashCommand(cmd, ctx);
  }

  getStatus(): EngineStatus {
    const current = this.modelRegistry.getCurrent();
    return {
      connected: this.initialized,
      model: `${current.provider}/${current.model}`,
      role: this.config.user.role,
      toolCount: this.allTools.length,
      permissionCount: this.permissionResolver?.getPermissions().length || 0,
    };
  }

  getCurrentModel(): ModelEntry {
    return this.modelRegistry.getCurrent();
  }

  getPermissions(): string[] {
    return this.permissionResolver?.getPermissions() || [];
  }

  getLoadedSkills() {
    return this.skillMatcher?.getAll() || [];
  }

  getAvailableTools(): ToolInfo[] {
    const permissions = this.permissionResolver?.getPermissions() || [];
    const filtered = filterToolsByPermission(this.allTools, permissions);
    return filtered.map((t) => ({
      name: t.name,
      description: t.description || "",
      requiredPermissions: (t._meta?.requiredPermissions as string[]) || [],
    }));
  }

  setConfirmHandler(handler: (req: ConfirmRequest) => Promise<boolean>) {
    this.confirmHandler = handler;
  }

  private async requestConfirmation(req: ConfirmRequest): Promise<boolean> {
    if (!this.confirmHandler) return true;
    return this.confirmHandler(req);
  }

  async dispose(): Promise<void> {
    this.permissionResolver?.dispose();
    if (this.ownsMcp) {
      await this.mcp.disconnect();
    }
    this.onDispose?.();
    this.initialized = false;
  }

  private async mcpListUsers(): Promise<Array<{ id: number; username: string; role: string; status: string }>> {
    const client = this.mcp.getClient();
    const ctx = { userId: this.config.user.userId, role: this.config.user.role };
    const res = await client.callTool({
      name: "user_list",
      arguments: { pageSize: 100, _context: ctx },
    });
    const text = (res.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!parsed.success || !parsed.data) return [];

    const roleRes = await client.callTool({
      name: "role_list",
      arguments: { _context: ctx },
    });
    const roleText = (roleRes.content as Array<{ type: string; text?: string }>)?.[0]?.text;
    const roleMap = new Map<number, string>();
    if (roleText) {
      const roleData = JSON.parse(roleText);
      if (roleData.success && roleData.data) {
        for (const r of roleData.data) roleMap.set(r.id, r.name);
      }
    }

    return parsed.data.map((u: any) => ({
      id: u.id,
      username: u.username,
      role: roleMap.get(u.roleId) || `role_${u.roleId}`,
      status: u.status,
    }));
  }

  private async switchToUser(userId: number): Promise<{
    user: { id: number; username: string; role: string; status: string };
    permissions: string[];
  }> {
    const users = await this.mcpListUsers();
    const target = users.find(u => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found`);

    this.config.user.userId = target.id;
    this.config.user.role = target.role;

    this.permissionResolver?.dispose();
    const resolverContext = this.contextOverride
      ?? (this.config.auth?.token ? { token: this.config.auth.token } : undefined);
    this.permissionResolver = new PermissionResolver(
      this.mcp,
      this.config.user.userId,
      this.config.user.role,
      resolverContext,
    );
    const permissions = await this.permissionResolver.initialize();

    this.session.clear();

    return { user: target, permissions };
  }

  private async resolveUserId(): Promise<void> {
    if (this.contextOverride || this.config.auth?.token) return;
    try {
      const client = this.mcp.getClient();
      const ctx = { userId: this.config.user.userId, role: this.config.user.role };

      const permRes = await client.callTool({
        name: "self_permissions",
        arguments: { _context: ctx },
      });
      const permText = (permRes.content as Array<{ type: string; text?: string }>)?.[0]?.text;
      if (permText) {
        const permData = JSON.parse(permText);
        if (permData.success && permData.data?.permissions?.length > 0) return;
      }

      const userRes = await client.callTool({
        name: "user_list",
        arguments: { keyword: this.config.user.role, pageSize: 50, _context: ctx },
      });
      const userText = (userRes.content as Array<{ type: string; text?: string }>)?.[0]?.text;
      if (!userText) return;
      const userData = JSON.parse(userText);
      if (!userData.success || !userData.data?.length) return;

      const match = userData.data.find((u: any) => u.username === this.config.user.role)
        || userData.data[0];
      if (match?.id && match.id !== this.config.user.userId) {
        this.config.user.userId = match.id;
      }
    } catch {
      // non-critical: keep configured userId
    }
  }

  private buildAiTools(
    visibleTools: ToolWithMeta[],
    contextPayload: Record<string, unknown>,
  ): Record<string, Tool<any, any>> {
    const client = this.mcp.getClient();
    const toolCaller = new ToolCaller(client, { contextPayload });

    const toolMetaMap = new Map<string, { destructive?: boolean | string[] }>();
    for (const t of visibleTools) {
      const meta = (t._meta || {}) as Record<string, unknown>;
      if (meta.destructive) {
        toolMetaMap.set(t.name, { destructive: meta.destructive as boolean | string[] });
      }
    }

    const result: Record<string, Tool<any, any>> = {};
    for (const t of visibleTools) {
      const schema = (t.inputSchema ?? {
        type: "object" as const,
      }) as Parameters<typeof jsonSchema>[0];
      const toolName = t.name;
      result[toolName] = defineTool<any, string>({
        description: t.description || "",
        inputSchema: jsonSchema<any>(schema),
        execute: async (args: any) => {
          const meta = toolMetaMap.get(toolName);
          if (meta && this.needsConfirmation(meta, args)) {
            const summary = `即将执行 ${toolName} (${args.action || "操作"})`;
            const confirmed = await this.requestConfirmation({
              toolName,
              action: args.action || "execute",
              summary,
              level: "destructive",
            });
            if (!confirmed) {
              return JSON.stringify({ success: false, error: { code: "USER_CANCELLED", message: "用户取消了操作" } });
            }
          }

          const res = await toolCaller.call(
            toolName,
            args as Record<string, unknown>,
          );
          const text = (res.content as Array<{ type: string; text?: string }>)
            ?.map((c) => c.text ?? "")
            .join("");
          return text;
        },
      });
    }
    return result;
  }

  private needsConfirmation(meta: { destructive?: boolean | string[] }, args: any): boolean {
    if (!meta.destructive) return false;
    if (meta.destructive === true) return true;
    if (Array.isArray(meta.destructive)) {
      return meta.destructive.includes(args?.action);
    }
    return false;
  }

  private resolveModel(entry: ModelEntry): LanguageModel {
    if (entry.provider === "custom") {
      return createModel("custom", entry.model, {
        endpoint: entry.endpoint || "",
        apiKey: this.modelRegistry.resolveApiKey(entry.apiKey || ""),
        model: entry.model,
      });
    }
    return createModel(entry.provider as ExtendedProvider, entry.model);
  }
}
