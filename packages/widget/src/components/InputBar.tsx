import React, { useState, useCallback, useRef } from "react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({ onSubmit, disabled, placeholder }: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, []);

  return (
    <div style={styles.container}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder || "输入消息，或用 / 开头执行命令..."}
        disabled={disabled}
        rows={1}
        style={styles.input}
      />
      <button onClick={handleSubmit} disabled={disabled || !value.trim()} style={styles.button}>
        发送
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: "1px solid #30363d",
    padding: "12px 16px",
    display: "flex",
    gap: 8,
    background: "#161b22",
  },
  input: {
    flex: 1,
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#e6edf3",
    fontFamily: "inherit",
    fontSize: 14,
    outline: "none",
    resize: "none",
  },
  button: {
    background: "#58a6ff",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
  },
};
