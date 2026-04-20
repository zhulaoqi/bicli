import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  version: string;
  model: string;
  mcpStatus: "connected" | "disconnected" | "connecting";
  role: string;
}

export function StatusBar({ version, model, mcpStatus, role }: StatusBarProps) {
  const statusIcon = mcpStatus === "connected" ? "●" : mcpStatus === "connecting" ? "◌" : "○";
  const statusColor = mcpStatus === "connected" ? "green" : mcpStatus === "connecting" ? "yellow" : "red";

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold>bicli {version}</Text>
      <Text>Model: <Text color="cyan">{model}</Text></Text>
      <Text>MCP: <Text color={statusColor}>{statusIcon}</Text></Text>
      <Text>Role: <Text color="magenta">{role}</Text></Text>
    </Box>
  );
}
