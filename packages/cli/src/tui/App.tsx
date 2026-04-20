import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { ChatArea, type ChatMessage } from "./components/ChatArea.js";
import { InputBar } from "./components/InputBar.js";
import { isSlashCommand, type BiCLIEngine, type SlashCommandResult } from "@bicli/core";

interface AppProps {
  engine: BiCLIEngine;
  model: string;
  role: string;
  mcpStatus: "connected" | "disconnected" | "connecting";
}

function formatSlashResult(result: SlashCommandResult): string {
  switch (result.type) {
    case "model_list":
      return result.models
        .map((m, i) => {
          const marker = m.id === result.current ? " ← current" : "";
          const avail = m.available ? "✓" : `✗ (需要 ${m.missingEnvKey})`;
          return `  ${i + 1}. ${m.name} (${m.provider}) [${avail}]${marker}`;
        })
        .join("\n");
    case "model_switched":
      return `模型已切换: ${result.from} → ${result.to.name}`;
    case "model_add_guide":
      return `在 ~/.bicli/models.json 的 models 数组中添加:\n${result.template || ""}`;
    case "model_removed":
      return `模型 "${result.id}" 已删除`;
    case "role_info":
      return `角色: ${result.role}\n权限: ${result.permissions.join(", ")}\n可用工具: ${result.availableTools.join(", ")}`;
    case "tools_list":
      return result.tools.map((t) => `  • ${t.name}: ${t.description}`).join("\n");
    case "cleared":
      return "对话历史已清空";
    case "help":
      return result.commands.map((c) => `  ${c.command} — ${c.description}`).join("\n");
    case "skill_list":
      if (result.skills.length === 0) return "暂无已加载的 Skill";
      return result.skills.map((s, i) =>
        `  ${i + 1}. ${s.title} (${s.name})\n     ${s.description}\n     触发词: ${s.triggers.join(", ")}\n     所需权限: ${s.requiredPermissions.join(", ") || "无"}`
      ).join("\n\n");
    case "skill_created":
      return `✅ Skill "${result.name}" 已创建\n📄 文件: ${result.path}\n\n请编辑该文件自定义 Skill 内容，重启 CLI 后生效。`;
    case "skill_create_guide":
      return result.template;
    case "user_list":
      return `可用用户:\n` + result.users.map((u) => {
        const marker = u.id === result.currentUserId ? " ← 当前" : "";
        return `  ${u.id}. ${u.username} [${u.role}] ${u.status}${marker}`;
      }).join("\n") + `\n\n输入 /user <id或用户名> 切换身份`;
    case "user_switched":
      return `身份已切换: ${result.from.username}(${result.from.role}) → ${result.to.username}(${result.to.role})\n权限: ${result.permissions.join(", ")}\n对话历史已清空`;
    case "session_list":
      if (result.sessions.length === 0) return "暂无历史会话";
      return `历史会话:\n` + result.sessions.map((s, i) => {
        const marker = s.id === result.currentId ? " ← 当前" : "";
        const date = new Date(s.updatedAt).toLocaleString();
        return `  ${i + 1}. ${s.title} (${s.messageCount}条消息, ${date})${marker}`;
      }).join("\n");
    case "session_saved":
      return `✅ 会话已保存: ${result.title} (${result.id})`;
    case "session_title_set":
      return `✅ 会话标题已设置: ${result.title}`;
    case "error":
      return `错误: ${result.message}`;
  }
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "(无参数)";
  try {
    const str = JSON.stringify(args, null, 0);
    return str.length > 120 ? str.slice(0, 120) + "…" : str;
  } catch { return "(序列化失败)"; }
}

function formatResult(result: unknown): string {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (parsed.success !== undefined) {
        return parsed.success ? "✅ 成功" : `❌ ${parsed.error?.message || "失败"}`;
      }
      const str = result.length > 100 ? result.slice(0, 100) + "…" : result;
      return str;
    } catch {
      return result.length > 100 ? result.slice(0, 100) + "…" : result;
    }
  }
  return String(result);
}

export function App({ engine, model, role, mcpStatus }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好！我是 BiCLI 智能助手。输入 /help 查看可用命令，输入 /user 切换用户测试权限。" },
  ]);
  const [loading, setLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState(model);
  const [currentRole, setCurrentRole] = useState(role);

  const handleClearScreen = useCallback(() => {
    setMessages([]);
  }, []);

  const handleSubmit = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      if (isSlashCommand(text)) {
        const result = await engine.executeSlashCommand(text);
        const formatted = formatSlashResult(result);
        setMessages((prev) => [...prev, { role: "system", content: formatted }]);
        if (result.type === "model_switched") {
          setCurrentModel(engine.getStatus().model);
        }
        if (result.type === "user_switched") {
          setCurrentRole(result.to.role);
        }
        if (result.type === "cleared") {
          setMessages([{ role: "system", content: "对话历史已清空" }]);
        }
      } else {
        let responseText = "";
        for await (const event of engine.chat(text)) {
          switch (event.type) {
            case "text_delta":
              responseText += event.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.toolCall) {
                  return [...prev.slice(0, -1), { role: "assistant", content: responseText }];
                }
                return [...prev, { role: "assistant", content: responseText }];
              });
              break;
            case "tool_call_start": {
              const argsStr = formatArgs(event.args);
              setMessages((prev) => [
                ...prev,
                { role: "system", content: `🔧 ${event.toolName}\n├─ 参数: ${argsStr}`, toolCall: event.toolName },
              ]);
              break;
            }
            case "tool_call_end":
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.toolCall) {
                  return [...prev.slice(0, -1), {
                    ...last,
                    content: `${last.content}\n├─ 耗时: ${event.duration}ms\n└─ 结果: ${formatResult(event.result)}`,
                  }];
                }
                return prev;
              });
              break;
            case "error":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `错误: ${event.message}` },
              ]);
              break;
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [engine]);

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar version="2.0.0" model={currentModel} mcpStatus={mcpStatus} role={currentRole} />
      <ChatArea messages={messages} />
      <Box paddingX={1}>
        <Text color="gray">[Ctrl+C] Exit  [↑↓] History  [Tab] Complete  [Ctrl+L] Clear  [Esc] Cancel  {loading ? "⏳ Thinking..." : ""}</Text>
      </Box>
      <InputBar onSubmit={handleSubmit} disabled={loading} onClearScreen={handleClearScreen} />
    </Box>
  );
}
