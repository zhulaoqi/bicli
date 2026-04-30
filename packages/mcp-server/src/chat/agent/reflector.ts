import type { AgentRunState, ReflectVerdict } from "./agent-state.js";
import type { ToolCallRecord } from "../session-store.js";

/**
 * Reflect 阶段规则层。
 *
 * 输入：完整 state（含 finalText、toolCalls、route）
 * 输出：ReflectVerdict
 *   - ok：通过，进入 Render
 *   - needs_repair：本轮存在质量问题，应触发一次 repair（再走 Act → Finalize）
 *   - fallback：直接用 verdict.text 替换 finalText，并跳过 repair（避免无意义重复）
 */

const FAKE_TOOL_CALL_PATTERNS = [
  /<tool_code>/i,
  /```\s*json\s*\{[\s\S]*?"name"\s*:/,
  /<tool_use>/i,
  /<function_calls>/i,
  /<!--[\s\S]*?tool_(call|result):[\s\S]*?-->/i,
];

const TOOL_HISTORY_COMMENT_PATTERN = /<!--[\s\S]*?tool_(history|call|result):[\s\S]*?-->/gi;
const DANGLING_TOOL_HISTORY_PATTERN = /<!--[\s\S]*?tool_(history|call|result):[\s\S]*$/gi;
const RAW_TOOL_HISTORY_LINE_PATTERN = /(^|\n)\s*tool_(history|call|result):[\s\S]*$/gi;

export function runReflect(state: AgentRunState): ReflectVerdict {
  const reasons: string[] = [];
  const text = state.finalText;
  const route = state.route.route;

  // 1. fake tool-call 文本：直接 fallback（不要再走 repair，因为模型 prompt 错了）
  if (FAKE_TOOL_CALL_PATTERNS.some((p) => p.test(text))) {
    return {
      verdict: "fallback",
      reasons: ["fake_tool_call_in_text"],
      text:
        "⚠️ 当前模型将工具调用以文本形式输出，而非通过 function calling 真正执行。\n\n" +
        "这意味着工具未被调用，操作未执行。请切换到支持 function calling 的模型（如 qwen-plus / qwen-max）后重试。",
    };
  }

  // 2. tool history comment 残留：清洗后 ok
  if (TOOL_HISTORY_COMMENT_PATTERN.test(text)) {
    const cleaned = stripToolHistoryComments(text);
    if (cleaned !== text) {
      return {
        verdict: "fallback",
        reasons: ["leaked_tool_history_comment"],
        text: cleaned,
      };
    }
  }
  if (DANGLING_TOOL_HISTORY_PATTERN.test(text) || RAW_TOOL_HISTORY_LINE_PATTERN.test(text)) {
    const cleaned = stripToolHistoryComments(text);
    if (cleaned !== text) {
      return {
        verdict: "fallback",
        reasons: ["leaked_tool_history_comment"],
        text: cleaned,
      };
    }
  }

  // 2.5 模型陷入重复刷屏（常见于“我将并行调用...”循环）：
  // 直接 fallback，避免把噪声文本继续透传给用户。
  if (hasRepetitiveStalledText(text)) {
    return {
      verdict: "fallback",
      reasons: ["repetitive_stalled_text"],
      text:
        "⚠️ 检测到模型输出重复，已中止本轮文本生成。\n\n" +
        "请重试该请求；若仍复现，可切换模型或把问题拆成两条更短指令。",
    };
  }

  // 3. 历史截断标记残留
  const withoutHistoryArtifacts = sanitizeVisibleHistoryArtifacts(text);
  if (withoutHistoryArtifacts !== text) {
    return {
      verdict: "fallback",
      reasons: ["leaked_history_truncation_marker"],
      text: withoutHistoryArtifacts,
    };
  }

  // 4. 实时/诊断/写路由必须调用工具：未调用任何工具就触发 repair
  const needsTool = route === "realtime_query" || route === "diagnosis" || route === "write_action";
  if (needsTool && state.toolCalls.length === 0) {
    reasons.push("missing_required_tool");
  }

  // 5. 大量列表项 + 0 工具调用 → 视为幻觉
  if (state.toolCalls.length === 0 && needsTool) {
    const listItemCount = (text.match(/^\s*[-•*◆▸◇]\s+.+|^\s*\d+[.)、]\s+.+/gm) || []).length;
    if (listItemCount > 8) {
      reasons.push("hallucinated_list_without_tools");
    }
  }

  // 6. analysis empty + finalize 推断未验证根因 → fallback 替换文本
  if (hasEmptyAnalysisResult(state.toolCalls) && hasUnverifiedRootCauseSpeculation(text)) {
    return {
      verdict: "fallback",
      reasons: ["unverified_empty_analysis_speculation"],
      text: replaceEmptyAnalysisSpeculation(),
    };
  }

  // 7. 工具失败但 finalize 没承认错误 → 标记 repair
  if (hasFailedToolButFinalizeIgnoresIt(state.toolCalls, text)) {
    reasons.push("ignored_tool_failure");
  }

  if (reasons.length > 0) {
    return { verdict: "needs_repair", reasons };
  }
  return { verdict: "ok", reasons: [] };
}

export function sanitizeEmptyAnalysisSpeculation(params: {
  text: string;
  toolCalls: ToolCallRecord[];
}): string {
  if (!hasEmptyAnalysisResult(params.toolCalls)) return params.text;
  if (!hasUnverifiedRootCauseSpeculation(params.text)) return params.text;
  return replaceEmptyAnalysisSpeculation();
}

export function sanitizeVisibleHistoryArtifacts(text: string): string {
  return text
    .replace(/\n?\s*…?\[回复已截断，共\s*\d+\s*字符。如需再次查看完整数据，请重新查询。]\s*/g, "")
    .trim();
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

function replaceEmptyAnalysisSpeculation(): string {
  return [
    "本次执行返回 0 条数据。",
    "",
    "基于当前工具结果，只能确认：在本次分析 ID、时间范围、产品和筛选条件下没有返回数据点或明细行。",
    "当前结果不能证明事件配置或上报链路存在问题，也不能证明数据源异常；这些都需要额外查询事件配置、原始日志或数据源状态后才能判断。",
    "",
    "可以继续做的验证：查询该产品下相关事件配置、检查同时间范围的原始明细、或放宽时间/筛选条件后重新执行。",
  ].join("\n");
}

function stripToolHistoryComments(text: string): string {
  return text
    .replace(TOOL_HISTORY_COMMENT_PATTERN, "")
    .replace(DANGLING_TOOL_HISTORY_PATTERN, "")
    .replace(RAW_TOOL_HISTORY_LINE_PATTERN, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function hasEmptyAnalysisResult(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => {
    if (call.name !== "dataeye_analysis_execute" || !call.result) return false;
    try {
      const parsed = typeof call.result === "string" ? JSON.parse(call.result) : call.result;
      const summary = parsed?.data?.summary;
      return summary?.resultStatus === "empty" ||
        (Number(summary?.dataPoints) === 0 && Number(summary?.rowCount) === 0);
    } catch {
      return false;
    }
  });
}

function hasUnverifiedRootCauseSpeculation(text: string): boolean {
  const speculationMarkers = /(初步诊断|可能原因|可能是|原因包括|建议操作|尚未|未注册|未上报|没有上报|命名不一致|SDK|埋点|数据源异常|用户群.*覆盖)/i;
  return speculationMarkers.test(text);
}

function hasFailedToolButFinalizeIgnoresIt(toolCalls: ToolCallRecord[], text: string): boolean {
  const failed = toolCalls.find((c) => c.status === "error");
  if (!failed) return false;
  if (text.includes("失败") || text.includes("错误") || text.includes("无法") || text.includes("权限")) return false;
  return true;
}

function hasRepetitiveStalledText(text: string): boolean {
  const normalized = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (normalized.length < 8) return false;

  const counter = new Map<string, number>();
  for (const line of normalized) {
    // 过短片段容易误判，不参与重复检测
    if (line.length < 12) continue;
    counter.set(line, (counter.get(line) ?? 0) + 1);
  }
  if (counter.size === 0) return false;
  const maxRepeat = Math.max(...counter.values());
  if (maxRepeat < 6) return false;

  // 覆盖度阈值：同一句占比 >= 45% 才视为卡死刷屏
  return maxRepeat / normalized.length >= 0.45;
}
