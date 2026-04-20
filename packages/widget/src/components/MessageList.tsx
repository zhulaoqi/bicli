import React, { useRef, useEffect } from "react";
import type { ChatMessage } from "../types.js";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={styles.container}>
      {messages.map((msg, i) => (
        <div key={i} style={{ ...styles.message, ...getMessageStyle(msg) }}>
          {msg.role === "user" && <span style={styles.label}>You</span>}
          {msg.role === "assistant" && <span style={styles.labelAi}>AI</span>}
          {msg.toolCall && (
            <div style={styles.toolBadge}>{msg.toolCall}</div>
          )}
          <div style={styles.content}>{msg.content}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function getMessageStyle(msg: ChatMessage): React.CSSProperties {
  switch (msg.role) {
    case "user":
      return { alignSelf: "flex-end", background: "#1f6feb", color: "#fff" };
    case "assistant":
      return { alignSelf: "flex-start", background: "#161b22", border: "1px solid #30363d" };
    case "system":
      return msg.toolCall
        ? { alignSelf: "stretch", background: "transparent", color: "#8b949e", fontSize: 12, fontFamily: "monospace", border: "1px solid #30363d" }
        : { alignSelf: "center", background: "transparent", color: "#8b949e", fontSize: 12 };
    default:
      return {};
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  message: {
    maxWidth: "85%",
    padding: "10px 14px",
    borderRadius: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 14,
    color: "#e6edf3",
  },
  label: {
    fontWeight: 600,
    color: "#3fb950",
    marginRight: 6,
    fontSize: 12,
  },
  labelAi: {
    fontWeight: 600,
    color: "#58a6ff",
    marginRight: 6,
    fontSize: 12,
  },
  content: {
    marginTop: 2,
  },
  toolBadge: {
    display: "inline-block",
    background: "#30363d",
    color: "#d29922",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 11,
    marginBottom: 4,
  },
};
