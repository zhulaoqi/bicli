import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@bicli/skills";
import type { SlashCommand, SlashCommandResult, UserInfo } from "./types.js";
import type { ModelRegistry } from "../model-registry/index.js";
import type { Session } from "../llm/session.js";
import type { ToolInfo } from "../types.js";
import type { SessionPersister } from "../storage/session-persister.js";

export interface SlashCommandContext {
  modelRegistry: ModelRegistry;
  session: Session;
  role: string;
  permissions: string[];
  availableTools: ToolInfo[];
  platform: "tui" | "web";
  refreshPermissions: () => Promise<string[]>;
  skills?: Skill[];
  skillsDir?: string;
  currentUserId: number;
  persister?: SessionPersister;
  switchUser?: (userId: number) => Promise<{ user: UserInfo; permissions: string[] }>;
  listUsers?: () => Promise<UserInfo[]>;
}

const HELP_COMMANDS = [
  { command: "/model", description: "显示可用模型列表，输入编号切换" },
  { command: "/model <id>", description: "快速切换到指定模型" },
  { command: "/model add", description: "添加自定义模型" },
  { command: "/model remove <id>", description: "删除自定义模型" },
  { command: "/user", description: "列出所有用户，显示当前身份" },
  { command: "/user <id|username>", description: "切换到指定用户（测试不同权限）" },
  { command: "/role", description: "查看当前角色和权限（只读）" },
  { command: "/tools", description: "显示当前可用的工具列表" },
  { command: "/skill", description: "列出已加载的 Skill" },
  { command: "/skill create <name>", description: "交互式创建新 Skill" },
  { command: "/history", description: "查看历史会话列表" },
  { command: "/save", description: "保存当前会话" },
  { command: "/title <标题>", description: "设置当前会话标题" },
  { command: "/clear", description: "清空对话历史" },
  { command: "/help", description: "显示本帮助信息" },
];

export async function handleSlashCommand(
  cmd: SlashCommand,
  ctx: SlashCommandContext
): Promise<SlashCommandResult> {
  switch (cmd.name) {
    case "model":
      return handleModelCommand(cmd.args, ctx);
    case "user":
      return handleUserCommand(cmd.args, ctx);
    case "role":
      return handleRoleCommand(ctx);
    case "tools":
      return handleToolsCommand(ctx);
    case "skill":
      return handleSkillCommand(cmd.args, ctx);
    case "history":
      return handleHistoryCommand(ctx);
    case "save":
      return handleSaveCommand(ctx);
    case "title":
      return handleTitleCommand(cmd.args, ctx);
    case "clear":
      ctx.session.clear();
      return { type: "cleared" };
    case "help":
      return { type: "help", commands: HELP_COMMANDS };
    default:
      return { type: "error", message: `未知命令: /${cmd.name}。输入 /help 查看可用命令。` };
  }
}

function handleModelCommand(args: string[], ctx: SlashCommandContext): SlashCommandResult {
  if (args.length === 0) {
    const models = ctx.modelRegistry.getDisplayList();
    const current = ctx.modelRegistry.getCurrent();
    return { type: "model_list", models, current: current.id };
  }

  if (args[0] === "add") {
    if (args.length >= 4) {
      const [, endpoint, model, rawKey, ...rest] = args;
      let apiKey = rawKey;

      if (rawKey.startsWith("env:")) {
        const envName = rawKey.slice(4);
        if (!process.env[envName]) {
          return {
            type: "error",
            message: [
              `环境变量 "${envName}" 不存在。`,
              "",
              "你是想直接传 API Key 吗？去掉 env: 前缀即可：",
              `  /model add ${endpoint} ${model} ${envName}`,
              "",
              "如果确实要用环境变量，先在 .env 中添加：",
              `  ${envName}=你的key值`,
            ].join("\n"),
          };
        }
      }

      const id = rest[0] || model.replace(/[^a-zA-Z0-9-]/g, "-");
      const name = rest[1] || `Custom: ${model}`;
      try {
        const entry = ctx.modelRegistry.addModel({
          id,
          name,
          provider: "custom",
          model,
          endpoint,
          apiKey,
        });
        ctx.modelRegistry.switchTo(entry.id);
        const prev = ctx.modelRegistry.getDisplayList().find(m => m.id !== entry.id);
        return {
          type: "model_switched",
          from: prev?.id || "",
          to: { id: entry.id, name: entry.name, provider: "custom", available: true },
        };
      } catch (err: any) {
        return { type: "error", message: err.message };
      }
    }

    const guide = [
      "添加自定义模型（支持任何 OpenAI 兼容接口）:",
      "",
      "  /model add <接口地址> <模型名> <API Key> [自定义ID] [显示名称]",
      "",
      "示例:",
      "  /model add http://49.0.206.228/v1 gpt-5.4 3f723d2ec92c4ba4",
      "  /model add https://api.deepseek.com/v1 deepseek-chat sk-xxxx",
      "  /model add http://localhost:11434/v1 llama3 any-key local-llama Llama3",
      "",
      "说明:",
      "  API Key 直接填写即可，会安全存储到 ~/.bicli/models.json",
      "  高级: 用 env:变量名 从环境变量读取（如 env:MY_KEY）",
    ].join("\n");
    return { type: "model_add_guide", platform: ctx.platform, template: guide };
  }

  if (args[0] === "remove" && args[1]) {
    try {
      ctx.modelRegistry.removeModel(args[1]);
      return { type: "model_removed", id: args[1] };
    } catch (err: any) {
      return { type: "error", message: err.message };
    }
  }

  try {
    const from = ctx.modelRegistry.getCurrent().id;
    const idOrIndex = /^\d+$/.test(args[0]) ? parseInt(args[0], 10) : args[0];
    const target = ctx.modelRegistry.switchTo(idOrIndex);
    const models = ctx.modelRegistry.getDisplayList();
    const info = models.find(m => m.id === target.id)!;
    return { type: "model_switched", from, to: info };
  } catch (err: any) {
    return { type: "error", message: err.message };
  }
}

async function handleRoleCommand(ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const permissions = await ctx.refreshPermissions();
  return {
    type: "role_info",
    role: ctx.role,
    permissions,
    availableTools: ctx.availableTools.map(t => t.name),
  };
}

async function handleUserCommand(args: string[], ctx: SlashCommandContext): Promise<SlashCommandResult> {
  if (!ctx.listUsers || !ctx.switchUser) {
    return { type: "error", message: "当前环境不支持用户切换" };
  }

  if (args.length === 0) {
    const users = await ctx.listUsers();
    return { type: "user_list", users, currentUserId: ctx.currentUserId };
  }

  const target = args[0];
  const users = await ctx.listUsers();
  const match = /^\d+$/.test(target)
    ? users.find(u => u.id === parseInt(target, 10))
    : users.find(u => u.username === target);

  if (!match) {
    return { type: "error", message: `未找到用户: ${target}。输入 /user 查看可用用户列表。` };
  }

  const fromUser = users.find(u => u.id === ctx.currentUserId) || {
    id: ctx.currentUserId, username: "unknown", role: ctx.role, status: "active",
  };

  const { user: toUser, permissions } = await ctx.switchUser(match.id);
  return { type: "user_switched", from: fromUser, to: toUser, permissions };
}

function handleToolsCommand(ctx: SlashCommandContext): SlashCommandResult {
  return {
    type: "tools_list",
    tools: ctx.availableTools.map(t => ({ name: t.name, description: t.description })),
  };
}

function handleSkillCommand(args: string[], ctx: SlashCommandContext): SlashCommandResult {
  if (args.length === 0 || args[0] === "list") {
    const skills = (ctx.skills || []).map(s => ({
      name: s.name,
      title: s.title,
      description: s.description,
      triggers: s.triggers,
      requiredPermissions: s.requiredPermissions,
    }));
    return { type: "skill_list", skills };
  }

  if (args[0] === "create") {
    const name = args[1];
    if (!name) {
      return { type: "error", message: "请指定 Skill 名称，如: /skill create my-skill" };
    }

    const dir = ctx.skillsDir;
    if (!dir) {
      return { type: "error", message: "Skill 目录未配置" };
    }

    const filePath = join(dir, `${name}.md`);
    if (existsSync(filePath)) {
      return { type: "error", message: `Skill "${name}" 已存在: ${filePath}` };
    }

    const availableTools = ctx.availableTools.map(t => t.name);
    const template = `---
name: ${name}
title: ${name} 助手
description: 在这里描述这个 Skill 的功能
triggers:
  - 触发词1
  - 触发词2
required_tools:
${availableTools.slice(0, 3).map(t => `  - ${t}`).join("\n")}
required_permissions:
  - data:read
---

# ${name} 助手

## 你的职责
描述 AI 在使用这个 Skill 时应该做什么。

## 可用工具
${availableTools.map(t => `- ${t}`).join("\n")}

## 交互流程
1. 理解用户意图
2. 选择合适的工具
3. 执行操作
4. 展示结果
`;

    writeFileSync(filePath, template, "utf-8");
    return { type: "skill_created", name, path: filePath };
  }

  return { type: "error", message: `未知子命令: /skill ${args[0]}。可用: /skill list, /skill create <name>` };
}

function handleHistoryCommand(ctx: SlashCommandContext): SlashCommandResult {
  if (!ctx.persister) return { type: "error", message: "会话持久化未启用" };
  const sessions = ctx.persister.listSessions();
  return { type: "session_list", sessions, currentId: ctx.persister.getCurrentId() };
}

function handleSaveCommand(ctx: SlashCommandContext): SlashCommandResult {
  if (!ctx.persister) return { type: "error", message: "会话持久化未启用" };
  ctx.persister.save();
  return { type: "session_saved", id: ctx.persister.getCurrentId(), title: ctx.persister.getTitle() };
}

function handleTitleCommand(args: string[], ctx: SlashCommandContext): SlashCommandResult {
  if (!ctx.persister) return { type: "error", message: "会话持久化未启用" };
  const title = args.join(" ").trim();
  if (!title) return { type: "error", message: "请指定标题，如: /title 今日工作会话" };
  ctx.persister.setTitle(title);
  return { type: "session_title_set", title };
}
