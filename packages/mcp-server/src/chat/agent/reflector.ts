import type { AgentRunState, ReflectVerdict } from "./agent-state.js";
import type { ToolCallRecord } from "../session-store.js";

/**
 * 注：当前文件是 P0 Chunk 5 的占位实现，仅提供 finalize 阶段所需的 `buildToolResultFallback`。
 * 完整规则层（漏调工具/伪成功/未验证根因/工具元数据残留）将在 Chunk 5 一并迁入。
 */

export function runReflect(state: AgentRunState): ReflectVerdict {
  // 占位：默认通过
  return {
    verdict: "ok",
    reasons: [],
  };
}

export function buildToolResultFallback(toolCalls: ToolCallRecord[]): string {
  const toolNames = toolCalls.map((r) => r.name).join(", ");
  const errors = toolCalls
    .map((call) => ({ call, parsed: parseToolResult(call.result) }))
    .filter(({ parsed }) => parsed?.success === false);

  if (errors.length > 0) {
    const lines = errors.map(({ call, parsed }) => {
      const message = parsed?.error?.message || parsed?.message || "未知错误";
      return `- ${call.name}: ${message}`;
    });
    return [
      `已调用工具：${toolNames}`,
      "",
      "工具返回了错误，无法继续生成基于实时数据的结论：",
      ...lines,
    ].join("\n");
  }

  const summaries = toolCalls
    .map((call) => summarizeToolResult(call))
    .filter(Boolean);

  if (summaries.length > 0) {
    return [
      `已调用工具：${toolNames}`,
      "",
      ...summaries,
      "",
      "模型本轮没有继续生成自然语言总结，以上为系统根据工具返回生成的兜底摘要。",
    ].join("\n");
  }

  return [
    `已调用工具：${toolNames}`,
    "",
    "工具已返回结果，但模型本轮没有继续生成自然语言总结。请缩小问题范围后重试，或指定要查看的字段。",
  ].join("\n");
}

function parseToolResult(result: unknown): any | null {
  if (!result) return null;
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function summarizeToolResult(call: ToolCallRecord): string | null {
  const parsed = parseToolResult(call.result);
  const data = parsed?.data;
  if (!data) return null;

  if (call.name === "dataeye_schedule_detail" && data.schedule) {
    const schedule = data.schedule;
    const status = schedule.active ? "运行中" : "未启动";
    return [
      "定时任务详情：",
      `- 名称：${schedule.name ?? "(未命名)"}`,
      `- 状态：${status}`,
      `- 类型：${schedule.type ?? "(未知)"}`,
      `- Cron：${schedule.cronExpression ?? "(未设置)"}`,
    ].join("\n");
  }

  if (call.name === "dataeye_schedule_logs" && Array.isArray(data.logs)) {
    return [
      `定时任务日志：共返回 ${data.logs.length} 条。`,
      ...data.logs.slice(0, 3).map((log: any, index: number) =>
        `- ${index + 1}. ${log.start ?? ""} ${log.status ?? ""} ${log.message ?? ""}`.trim(),
      ),
    ].join("\n");
  }

  if (typeof data.total === "number") {
    return `${call.name} 返回 total=${data.total}。`;
  }

  if (Array.isArray(data)) {
    return `${call.name} 返回 ${data.length} 条记录。`;
  }

  return `${call.name} 已成功返回结果。`;
}
