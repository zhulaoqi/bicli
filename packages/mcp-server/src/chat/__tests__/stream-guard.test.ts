import { describe, expect, it } from "vitest";
import { sanitizeEmptyAnalysisSpeculation, shouldRequireToolCall } from "../stream.js";

describe("sanitizeEmptyAnalysisSpeculation", () => {
  it("replaces unverified root-cause speculation after an empty analysis result", () => {
    const sanitized = sanitizeEmptyAnalysisSpeculation({
      text: "初步诊断：该事件尚未在 SDK 中注册或命名不一致，可能没有上报。",
      toolCalls: [
        {
          id: "call_1",
          name: "dataeye_analysis_execute",
          args: {},
          status: "done",
          result: JSON.stringify({
            success: true,
            data: {
              summary: {
                resultStatus: "empty",
                dataPoints: 0,
                rowCount: 0,
                interpretation: {
                  conclusion: "本次执行返回 0 条数据。",
                  evidence: "工具结果仅能证明当前查询条件下无数据点或无返回行。",
                },
              },
            },
          }),
        },
      ],
    });

    expect(sanitized).toContain("本次执行返回 0 条数据");
    expect(sanitized).toContain("不能证明事件配置或上报链路存在问题");
    expect(sanitized).not.toMatch(/SDK|未注册|命名不一致|可能没有上报/);
  });

  it("keeps grounded empty-result text unchanged", () => {
    const text = "本次执行返回 0 条数据。当前工具结果只能说明查询条件下没有返回行。";

    expect(sanitizeEmptyAnalysisSpeculation({
      text,
      toolCalls: [
        {
          id: "call_1",
          name: "dataeye_analysis_execute",
          args: {},
          status: "done",
          result: JSON.stringify({
            success: true,
            data: { summary: { resultStatus: "empty", dataPoints: 0, rowCount: 0 } },
          }),
        },
      ],
    })).toBe(text);
  });
});

describe("shouldRequireToolCall", () => {
  it("requires tools for realtime query and execution intents", () => {
    expect(shouldRequireToolCall("执行 2661 总计没有显示 事件分析")).toBe(true);
    expect(shouldRequireToolCall("查一下 MY_CGT210_SceneryTile 产品下所有启用事件")).toBe(true);
    expect(shouldRequireToolCall("我有哪些漏斗分析")).toBe(true);
    expect(shouldRequireToolCall("这个看板的数据结果怎么样")).toBe(true);
    expect(shouldRequireToolCall("导出这个图表的数据")).toBe(true);
  });

  it("does not require tools for help-center or conceptual questions", () => {
    expect(shouldRequireToolCall("事件分析是什么")).toBe(false);
    expect(shouldRequireToolCall("怎么配置留存分析")).toBe(false);
    expect(shouldRequireToolCall("解释一下数据表管理的字段类型")).toBe(false);
    expect(shouldRequireToolCall("为什么需要设置转化窗口，讲下概念")).toBe(false);
  });

  it("requires tools when a help-like question points to concrete current data", () => {
    expect(shouldRequireToolCall("为什么 2661 这个事件分析没有数据")).toBe(true);
    expect(shouldRequireToolCall("帮我看看当前页面数据为什么为空")).toBe(true);
  });
});
