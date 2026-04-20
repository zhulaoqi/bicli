import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

const SLASH_COMMANDS = ["/model", "/role", "/tools", "/clear", "/help", "/skill"];

interface InputBarProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  onClearScreen?: () => void;
}

export function InputBar({ onSubmit, disabled, onClearScreen }: InputBarProps) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  useInput((inputChar, key) => {
    if (disabled) return;

    if (key.return) {
      if (input.trim()) {
        historyRef.current.unshift(input.trim());
        if (historyRef.current.length > 50) historyRef.current.pop();
        historyIndexRef.current = -1;
        onSubmit(input.trim());
        setInput("");
        setHint("");
      }
      return;
    }

    if (key.escape) {
      setInput("");
      setHint("");
      historyIndexRef.current = -1;
      return;
    }

    if (key.ctrl && inputChar === "l") {
      onClearScreen?.();
      return;
    }

    if (key.upArrow) {
      const history = historyRef.current;
      if (history.length === 0) return;
      const next = Math.min(historyIndexRef.current + 1, history.length - 1);
      historyIndexRef.current = next;
      setInput(history[next]);
      setHint("");
      return;
    }

    if (key.downArrow) {
      const history = historyRef.current;
      const next = historyIndexRef.current - 1;
      if (next < 0) {
        historyIndexRef.current = -1;
        setInput("");
      } else {
        historyIndexRef.current = next;
        setInput(history[next]);
      }
      setHint("");
      return;
    }

    if (key.tab) {
      if (hint) {
        setInput(hint);
        setHint("");
      } else if (input.startsWith("/")) {
        const match = SLASH_COMMANDS.find(c => c.startsWith(input) && c !== input);
        if (match) setHint(match);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setHint("");
      historyIndexRef.current = -1;
    } else if (!key.ctrl && !key.meta && inputChar) {
      setInput((prev) => prev + inputChar);
      setHint("");
      historyIndexRef.current = -1;
    }
  });

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text color="gray">&gt; </Text>
      <Text>{input}</Text>
      {hint && <Text color="gray">{hint.slice(input.length)}</Text>}
      {!disabled && <Text color="gray">▋</Text>}
    </Box>
  );
}
