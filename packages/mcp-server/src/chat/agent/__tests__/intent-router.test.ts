import { describe, expect, it, vi } from "vitest";
import { routeUserMessage, runRouter, type RouteInput } from "../intent-router.js";

const baseInput = (overrides: Partial<RouteInput> = {}): RouteInput => ({
  userMessage: "",
  history: [],
  pageContextEvidence: false,
  ...overrides,
});

describe("intent-router (rule layer)", () => {
  describe("knowledge route", () => {
    it.each([
      "帮我看下接入 SDK 的流程",
      "定时任务启动和立即执行的区别",
      "这里最佳实践到底是什么",
      "解释一下漏斗分析的概念",
      "看板和图表是什么意思",
    ])("classifies %j as knowledge", (msg) => {
      const decision = routeUserMessage(baseInput({ userMessage: msg }));
      expect(decision.route).toBe("knowledge");
      expect(decision.needsKnowledge).toBe(true);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe("realtime_query route", () => {
    it.each([
      ["查一下定时任务列表", "schedule"],
      ["MY_CGT210_SceneryTile 的事件有哪些", "event"],
      ["列出当前页面看板的图表", "dashboard"],
      ["查询 ID=2661 这个分析的明细", "analysis"],
    ] as const)("classifies %j as realtime_query with domain=%s", (msg, expectedDomain) => {
      const decision = routeUserMessage(baseInput({ userMessage: msg }));
      expect(decision.route).toBe("realtime_query");
      expect(decision.domains).toEqual(expect.arrayContaining([expectedDomain]));
    });

    it("uses pageContextEvidence to lift confidence on vague realtime questions", () => {
      const decision = routeUserMessage(
        baseInput({ userMessage: "当前页面数据怎么样", pageContextEvidence: true }),
      );
      expect(decision.route).toBe("realtime_query");
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe("write_action route", () => {
    it.each([
      "帮我创建一个用户 analyst@example.com",
      "把任务 X 的收件人改成 Y",
      "删除这个定时任务",
      "新增一个角色叫数据分析师",
    ])("classifies %j as write_action", (msg) => {
      const decision = routeUserMessage(baseInput({ userMessage: msg }));
      expect(decision.route).toBe("write_action");
      expect(decision.needsUserConfirm).toBe(true);
    });
  });

  describe("diagnosis route", () => {
    it.each([
      "为什么 2661 这个事件分析没有数据",
      "这个看板为什么不显示",
      "任务执行失败了，看下原因",
      "这个分析为空，是为什么",
    ])("classifies %j as diagnosis", (msg) => {
      const decision = routeUserMessage(baseInput({ userMessage: msg }));
      expect(decision.route).toBe("diagnosis");
    });
  });

  describe("visual_explain route", () => {
    it.each([
      "画个状态机说明一下定时任务生命周期",
      "用流程图解释 SDK 接入步骤",
      "画一下漏斗分析的工作原理",
    ])("classifies %j as visual_explain with preferMermaid hint", (msg) => {
      const decision = routeUserMessage(baseInput({ userMessage: msg }));
      expect(decision.route).toBe("visual_explain");
      expect(decision.needsKnowledge).toBe(true);
    });
  });

  describe("ambiguous fallback", () => {
    it("returns realtime_query with low confidence on a bare '分析一下'", () => {
      const decision = routeUserMessage(baseInput({ userMessage: "分析一下" }));
      expect(decision.confidence).toBeLessThan(0.5);
      expect(decision.route).toBe("realtime_query");
    });

    it("returns realtime_query for empty input with confidence=0", () => {
      const decision = routeUserMessage(baseInput({ userMessage: "" }));
      expect(decision.confidence).toBe(0);
    });
  });
});

describe("runRouter (LLM override)", () => {
  it("respects rule layer when confidence is high", async () => {
    const llm = vi.fn();
    const decision = await runRouter(
      baseInput({ userMessage: "帮我看下接入 SDK 的流程" }),
      { llm: llm as any, allowOverride: true },
    );
    expect(decision.route).toBe("knowledge");
    expect(llm).not.toHaveBeenCalled();
  });

  it("invokes LLM override when confidence is low", async () => {
    const llm = vi.fn().mockResolvedValue({
      route: "realtime_query",
      confidence: 0.8,
      domains: ["analysis"],
      needsKnowledge: false,
      needsUserConfirm: false,
      reasoning: "model thinks this is realtime",
    });
    const decision = await runRouter(
      baseInput({ userMessage: "分析一下" }),
      { llm: llm as any, allowOverride: true },
    );
    expect(llm).toHaveBeenCalledTimes(1);
    expect(decision.route).toBe("realtime_query");
    expect(decision.reasoning).toContain("model");
  });

  it("falls back to rule decision when LLM override times out", async () => {
    const llm = vi.fn(() => new Promise(() => {}));
    const decision = await runRouter(
      baseInput({ userMessage: "分析一下" }),
      { llm: llm as any, allowOverride: true, timeoutMs: 30 },
    );
    expect(decision.route).toBe("realtime_query");
    expect(decision.confidence).toBeLessThan(0.5);
  });

  it("falls back to rule decision when LLM override returns malformed JSON", async () => {
    const llm = vi.fn().mockResolvedValue({ junk: true });
    const decision = await runRouter(
      baseInput({ userMessage: "分析一下" }),
      { llm: llm as any, allowOverride: true },
    );
    expect(llm).toHaveBeenCalledTimes(1);
    expect(decision.route).toBe("realtime_query");
  });

  it("AGENT_ROUTER_DISABLE_LLM=1 disables LLM override even when allowed", async () => {
    const llm = vi.fn();
    const prev = process.env.AGENT_ROUTER_DISABLE_LLM;
    process.env.AGENT_ROUTER_DISABLE_LLM = "1";
    try {
      const decision = await runRouter(
        baseInput({ userMessage: "分析一下" }),
        { llm: llm as any, allowOverride: true },
      );
      expect(decision.route).toBe("realtime_query");
      expect(llm).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.AGENT_ROUTER_DISABLE_LLM;
      else process.env.AGENT_ROUTER_DISABLE_LLM = prev;
    }
  });

  it("schedule + ID context lifts realtime_query domain even when wording is knowledge-like", async () => {
    const llm = vi.fn();
    const decision = await runRouter(
      baseInput({
        userMessage: "帮我看下定时任务的发送逻辑",
        history: [
          { role: "user", content: "scheduleId=abc-123 你帮我看一下" },
          { role: "assistant", content: "好的" },
        ],
      }),
      { llm: llm as any, allowOverride: false },
    );
    // 即便 wording 含"看下/逻辑"偏知识，由于历史消息里有 scheduleId，
    // 应该至少把 schedule 放进 domains，提示后续 selector 仍允许 schedule 域工具。
    expect(decision.domains).toEqual(expect.arrayContaining(["schedule"]));
  });
});
