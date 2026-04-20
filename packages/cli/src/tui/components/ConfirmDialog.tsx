import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { ConfirmRequest } from "@bicli/core";

interface ConfirmDialogProps {
  request: ConfirmRequest;
  onConfirm: (confirmed: boolean) => void;
}

export function ConfirmDialog({ request, onConfirm }: ConfirmDialogProps) {
  useInput(useCallback((input: string) => {
    const lower = input.toLowerCase();
    if (lower === "y") onConfirm(true);
    else if (lower === "n") onConfirm(false);
  }, [onConfirm]));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
      <Text color="yellow" bold>⚠️  敏感操作确认</Text>
      <Box marginTop={1}>
        <Text>工具: <Text bold>{request.toolName}</Text></Text>
      </Box>
      <Box>
        <Text>操作: <Text bold>{request.action}</Text></Text>
      </Box>
      <Box>
        <Text>说明: {request.summary}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">[Y]</Text>
        <Text> 确认执行  </Text>
        <Text color="red">[N]</Text>
        <Text> 取消</Text>
      </Box>
    </Box>
  );
}
