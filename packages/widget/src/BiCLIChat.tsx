import React, { useState, useCallback, useEffect, useRef } from "react";
import { EmbedEngine } from "@bicli/embed";
import type { ChatEvent } from "@bicli/embed";
import { MessageList } from "./components/MessageList.js";
import { InputBar } from "./components/InputBar.js";
import type { ChatMessage, BiCLIChatProps } from "./types.js";

function formatArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "(无参数)";
  try {
    const str = JSON.stringify(args);
    return str.length > 120 ? str.slice(0, 120) + "…" : str;
  } catch {
    return "(序列化失败)";
  }
}

function formatResult(result: unknown): string {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (parsed.success !== undefined) {
        return parsed.success ? "成功" : `失败: ${parsed.error?.message || ""}`;
      }
    } catch {}
    return result.length > 100 ? result.slice(0, 100) + "…" : result;
  }
  return String(result);
}

export function BiCLIChat(props: BiCLIChatProps) {
  const {
    mcpEndpoint,
    llmConfig,
    userId,
    userRole,
    token,
    maxTurns,
    welcomeMessage = "你好！我是 AI 助手。有什么可以帮你的？",
    style,
  } = props;

  const engineRef = useRef<EmbedEngine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toolCount, setToolCount] = useState(0);

  useEffect(() => {
    const engine = new EmbedEngine({
      mcpEndpoint,
      llmConfig,
      userId,
      userRole,
      token,
      maxTurns,
    });
    engineRef.current = engine;

    engine.initialize().then(({ toolCount: count }) => {
      setConnected(true);
      setToolCount(count);
    }).catch((err) => {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `连接失败: ${err.message}` },
      ]);
    });

    return () => {
      engine.dispose();
    };
  }, [mcpEndpoint, llmConfig.endpoint, llmConfig.model, userId, userRole]);

  const handleSubmit = useCallback(async (text: string) => {
    const engine = engineRef.current;
    if (!engine || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    if (text.startsWith("/")) {
      const handled = await handleCommand(engine, text);
      if (handled) {
        setLoading(false);
        return;
      }
    }

    let responseText = "";
    try {
      for await (const event of engine.chat(text)) {
        handleChatEvent(event, responseText, (newText) => {
          responseText = newText;
        });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `错误: ${err instanceof Error ? err.message : "未知错误"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleChatEvent = useCallback((event: ChatEvent, currentText: string, setText: (t: string) => void) => {
    switch (event.type) {
      case "text_delta":
        setText(currentText + event.content);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.toolCall) {
            return [...prev.slice(0, -1), { role: "assistant" as const, content: currentText + event.content }];
          }
          return [...prev, { role: "assistant" as const, content: currentText + event.content }];
        });
        break;
      case "tool_call_start":
        setMessages((prev) => [
          ...prev,
          { role: "system" as const, content: `🔧 ${event.toolName}\n├─ 参数: ${formatArgs(event.args)}`, toolCall: event.toolName },
        ]);
        break;
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
          { role: "system" as const, content: `错误: ${event.message}` },
        ]);
        break;
    }
  }, []);

  const handleCommand = useCallback(async (engine: EmbedEngine, text: string): Promise<boolean> => {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case "/clear":
        engine.clearMessages();
        setMessages([{ role: "system", content: "对话已清空" }]);
        return true;
      case "/save": {
        const title = parts.slice(1).join(" ") || undefined;
        const result = await engine.saveSession(title);
        setMessages((prev) => [...prev, { role: "system", content: `会话已保存 (ID: ${result.sessionId})` }]);
        return true;
      }
      case "/history": {
        const sessions = await engine.listSessions();
        if (sessions.length === 0) {
          setMessages((prev) => [...prev, { role: "system", content: "暂无历史会话" }]);
        } else {
          const list = sessions.map((s, i) => `${i + 1}. ${s.title || "未命名"} (${s.messageCount || 0}条消息)`).join("\n");
          setMessages((prev) => [...prev, { role: "system", content: `历史会话:\n${list}` }]);
        }
        return true;
      }
      case "/help":
        setMessages((prev) => [...prev, {
          role: "system",
          content: [
            "/clear — 清空对话",
            "/save [标题] — 保存当前会话",
            "/history — 查看历史会话",
            "/help — 显示帮助",
          ].join("\n"),
        }]);
        return true;
      default:
        return false;
    }
  }, []);

  return (
    <div style={{ ...containerStyle, ...style }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, color: "#58a6ff" }}>BiCLI</span>
        <span style={{ color: connected ? "#3fb950" : "#f85149" }}>
          {connected ? `● 已连接 (${toolCount} 工具)` : "○ 未连接"}
        </span>
        <span style={{ color: "#8b949e" }}>角色: {userRole}</span>
      </div>
      <MessageList messages={messages} />
      <InputBar onSubmit={handleSubmit} disabled={loading || !connected} />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0d1117",
  color: "#e6edf3",
  fontFamily: "'SF Mono', 'Cascadia Code', monospace",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #30363d",
};

const headerStyle: React.CSSProperties = {
  background: "#161b22",
  borderBottom: "1px solid #30363d",
  padding: "8px 16px",
  display: "flex",
  gap: 24,
  alignItems: "center",
  fontSize: 13,
};
