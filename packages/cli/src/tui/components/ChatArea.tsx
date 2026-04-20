import React from "react";
import { Box, Text } from "ink";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCall?: string;
}

interface ChatAreaProps {
  messages: ChatMessage[];
}

export function ChatArea({ messages }: ChatAreaProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1} flexDirection="column">
          {msg.role === "user" && (
            <Text>
              <Text color="green" bold>You: </Text>
              {msg.content}
            </Text>
          )}
          {msg.role === "assistant" && (
            <Text>
              <Text color="blue" bold>AI: </Text>
              {msg.content}
            </Text>
          )}
          {msg.role === "system" && msg.toolCall && (
            <Text color="yellow" dimColor>{msg.content}</Text>
          )}
          {msg.role === "system" && !msg.toolCall && (
            <Text color="cyan">{msg.content}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
