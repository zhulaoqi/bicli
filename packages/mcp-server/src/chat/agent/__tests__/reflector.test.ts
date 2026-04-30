import { describe, expect, it } from "vitest";
import {
  runReflect,
  buildToolResultFallback,
  sanitizeEmptyAnalysisSpeculation,
  sanitizeVisibleHistoryArtifacts,
} from "../reflector.js";
import { createInitialAgentRunState, type AgentRunState } from "../agent-state.js";
import type { ToolCallRecord } from "../../session-store.js";

function makeState(
  overrides: Partial<AgentRunState> = {},
): AgentRunState {
  const state = createInitialAgentRunState({
    sessionId: 1,
    userMessage: "test",
    history: [],
  });
  state.route = {
    route: "realtime_query",
    confidence: 0.8,
    domains: [],
    needsKnowledge: false,
    needsUserConfirm: false,
    reasoning: "test",
  };
  return Object.assign(state, overrides);
}

describe("runReflect", () => {
  it("returns ok for healthy realtime answer", () => {
    const state = makeState({
      finalText: "查询到 3 个定时任务，分别为 A / B / C。",
      toolCalls: [
        { id: "1", name: "dataeye_schedule_list", args: {}, status: "done", result: '{"success":true,"data":{"total":3}}' },
      ],
    });
    expect(runReflect(state).verdict).toBe("ok");
  });

  it("flags missing_required_tool when realtime route has no tool calls", () => {
    const state = makeState({
      finalText: "我帮你查到 3 个任务",
      toolCalls: [],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("needs_repair");
    expect(verdict.reasons).toContain("missing_required_tool");
  });

  it("flags hallucinated_list_without_tools when no tools but many list items", () => {
    const text = Array.from({ length: 10 })
      .map((_, i) => `- 项目 ${i + 1}：示例`)
      .join("\n");
    const state = makeState({ finalText: text, toolCalls: [] });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("needs_repair");
    expect(verdict.reasons).toEqual(
      expect.arrayContaining(["missing_required_tool", "hallucinated_list_without_tools"]),
    );
  });

  it("returns fallback with replacement text when finalize includes <tool_code>", () => {
    const state = makeState({
      finalText: "<tool_code>{\"name\":\"foo\"}</tool_code>",
      toolCalls: [],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.text).toContain("function calling");
  });

  it("returns fallback when final text is repetitive stalled sentence", () => {
    const repeated = Array.from({ length: 14 })
      .map(() => "我将并行调用多个工具来获取您的分析列表。")
      .join("\n\n");
    const state = makeState({
      finalText: repeated,
      toolCalls: [],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.reasons).toContain("repetitive_stalled_text");
    expect(verdict.text).toContain("检测到模型输出重复");
  });

  it("returns fallback with cleaned text when finalize leaks tool_history comment", () => {
    const state = makeState({
      finalText: "好的，查询完成。\n\n<!-- tool_history: prev=foo -->\n更多详情请询问。",
      toolCalls: [
        { id: "1", name: "dataeye_schedule_list", args: {}, status: "done", result: "{}" },
      ],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.text).not.toContain("tool_history");
    expect(verdict.text).toContain("好的，查询完成");
  });

  it("returns fallback with cleaned text when tool_history marker is dangling/unclosed", () => {
    const state = makeState({
      finalText:
        "查询完成。\n\n<!--\ntool_history:dataeye_knowledge_search:ok|dataeye_concept_explain:ok|",
      toolCalls: [
        { id: "1", name: "dataeye_knowledge_search", args: {}, status: "done", result: "{}" },
      ],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.reasons).toContain("leaked_tool_history_comment");
    expect(verdict.text).toBe("查询完成。");
  });

  it("returns fallback with grounded text on empty analysis + speculative root cause", () => {
    const state = makeState({
      finalText: "初步诊断：该事件 SDK 未注册，可能没有上报。",
      toolCalls: [
        {
          id: "1",
          name: "dataeye_analysis_execute",
          args: {},
          status: "done",
          result: JSON.stringify({
            success: true,
            data: { summary: { resultStatus: "empty", dataPoints: 0, rowCount: 0 } },
          }),
        },
      ],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.text).toContain("本次执行返回 0 条数据");
    expect(verdict.text).not.toContain("SDK");
  });

  it("flags ignored_tool_failure when a tool errored but finalize claims success", () => {
    const state = makeState({
      finalText: "已为你成功创建任务。",
      toolCalls: [
        {
          id: "1",
          name: "dataeye_schedule_create",
          args: {},
          status: "error",
          result: JSON.stringify({ success: false, error: { message: "无效的 cron 表达式" } }),
        },
      ],
    });
    const verdict = runReflect(state);
    expect(verdict.verdict).toBe("needs_repair");
    expect(verdict.reasons).toContain("ignored_tool_failure");
  });

  it("knowledge route does not require tools", () => {
    const state = makeState({
      finalText: "事件分析是用于...",
      toolCalls: [],
    });
    state.route.route = "knowledge";
    expect(runReflect(state).verdict).toBe("ok");
  });
});

describe("re-exported helpers stay backwards compatible", () => {
  it("buildToolResultFallback still produces the legacy shape", () => {
    const result = buildToolResultFallback([
      {
        id: "1",
        name: "dataeye_schedule_detail",
        args: {},
        status: "done",
        result: JSON.stringify({ success: true, data: { schedule: { name: "X", active: true, type: "EMAIL", cronExpression: "* * * * *" } } }),
      } as ToolCallRecord,
    ]);
    expect(result).toContain("已调用工具");
    expect(result).toContain("X");
  });

  it("sanitizeEmptyAnalysisSpeculation behaves as before", () => {
    const text = "初步诊断：未上报";
    const result = sanitizeEmptyAnalysisSpeculation({
      text,
      toolCalls: [
        {
          id: "1",
          name: "dataeye_analysis_execute",
          args: {},
          status: "done",
          result: JSON.stringify({ success: true, data: { summary: { resultStatus: "empty", dataPoints: 0, rowCount: 0 } } }),
        } as ToolCallRecord,
      ],
    });
    expect(result).toContain("本次执行返回 0 条数据");
    expect(result).not.toContain("未上报");
  });

  it("sanitizeVisibleHistoryArtifacts removes truncation marker", () => {
    expect(
      sanitizeVisibleHistoryArtifacts(
        "已查询完成。\n…[回复已截断，共 100 字符。如需再次查看完整数据，请重新查询。]",
      ),
    ).toBe("已查询完成。");
  });
});
