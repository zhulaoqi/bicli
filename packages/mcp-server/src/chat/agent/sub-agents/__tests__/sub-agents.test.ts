import { describe, expect, it } from "vitest";
import { pickSubAgent, applySubAgent } from "../sub-agent.js";
import { scheduleRunner } from "../schedule-runner.js";
import { analysisRunner } from "../analysis-runner.js";
import { userRunner } from "../user-runner.js";
import type { RouteDecision } from "../../agent-state.js";
import { createInitialAgentRunState } from "../../agent-state.js";

function decision(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    route: "realtime_query",
    confidence: 0.9,
    domains: [],
    needsKnowledge: false,
    needsUserConfirm: false,
    reasoning: "test",
    ...overrides,
  };
}

describe("pickSubAgent", () => {
  it("returns schedule runner when domain includes schedule", () => {
    expect(pickSubAgent(decision({ domains: ["schedule"] }))?.name).toBe("schedule");
  });

  it("returns analysis runner when domain includes analysis or event", () => {
    expect(pickSubAgent(decision({ domains: ["analysis"] }))?.name).toBe("analysis");
    expect(pickSubAgent(decision({ domains: ["event"] }))?.name).toBe("analysis");
  });

  it("prefers analysis over user when project/chart coexists with role (DAU 全项目场景)", () => {
    expect(pickSubAgent(decision({ domains: ["project", "chart", "role"] }))?.name).toBe("analysis");
  });

  it("returns user runner when domain includes user or role only", () => {
    expect(pickSubAgent(decision({ domains: ["user"] }))?.name).toBe("user");
    expect(pickSubAgent(decision({ domains: ["role"] }))?.name).toBe("user");
  });

  it("returns null when no domain matches", () => {
    expect(pickSubAgent(decision({ domains: [] }))).toBeNull();
    expect(pickSubAgent(decision({ domains: ["unknown_domain"] }))).toBeNull();
  });
});

describe("applySubAgent", () => {
  it("schedule sub-agent appends schedule guidance and limits allowed tools to schedule", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "查一下定时任务列表",
      history: [],
    });
    state.route = decision({ domains: ["schedule"] });
    state.allowedToolNames = [
      "dataeye_schedule_list",
      "dataeye_schedule_detail",
      "dataeye_event_analysis",
      "dataeye_user_list",
    ];

    const result = applySubAgent(scheduleRunner, state, "base prompt");

    expect(result.systemPrompt).toContain("base prompt");
    expect(result.systemPrompt).toMatch(/定时|schedule/i);
    expect(state.allowedToolNames).toEqual([
      "dataeye_schedule_list",
      "dataeye_schedule_detail",
    ]);
  });

  it("analysis sub-agent keeps event/analysis tools", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "查 7 天事件分析",
      history: [],
    });
    state.route = decision({ domains: ["analysis"] });
    state.allowedToolNames = [
      "dataeye_event_analysis",
      "dataeye_event_list",
      "dataeye_schedule_list",
    ];

    applySubAgent(analysisRunner, state, "base");
    expect(state.allowedToolNames).toEqual([
      "dataeye_event_analysis",
      "dataeye_event_list",
    ]);
  });

  it("user sub-agent restores project_list when domains include project", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "我有权限的所有项目",
      history: [],
    });
    state.route = decision({ domains: ["project", "role"] });
    state.allowedToolNames = [
      "dataeye_user_list",
      "dataeye_role_list",
      "dataeye_project_list",
      "dataeye_event_analysis",
    ];

    applySubAgent(userRunner, state, "base");
    expect(state.allowedToolNames).toContain("dataeye_project_list");
    expect(state.allowedToolNames).not.toContain("dataeye_event_analysis");
  });

  it("user sub-agent keeps user/role tools and lets dataeye_user_*_create through", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "新增一个用户 xx",
      history: [],
    });
    state.route = decision({ domains: ["user"] });
    state.allowedToolNames = [
      "dataeye_user_list",
      "dataeye_user_create",
      "dataeye_role_list",
      "dataeye_schedule_list",
    ];

    applySubAgent(userRunner, state, "base");
    expect(state.allowedToolNames).toEqual([
      "dataeye_user_list",
      "dataeye_user_create",
      "dataeye_role_list",
    ]);
  });

  it("preserves knowledge tools across all sub-agents", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "x",
      history: [],
    });
    state.allowedToolNames = [
      "dataeye_knowledge_search",
      "dataeye_concept_explain",
      "dataeye_schedule_list",
      "dataeye_event_analysis",
      "dataeye_user_list",
    ];
    state.route = decision({ domains: ["schedule"] });
    applySubAgent(scheduleRunner, state, "base");
    expect(state.allowedToolNames).toEqual([
      "dataeye_knowledge_search",
      "dataeye_concept_explain",
      "dataeye_schedule_list",
    ]);
  });

  it("returns null sub-agent when route is knowledge", () => {
    expect(
      pickSubAgent(decision({ route: "knowledge", domains: ["schedule"] })),
    ).toBeNull();
  });

  it("returns null sub-agent when route is visual_explain", () => {
    expect(
      pickSubAgent(decision({ route: "visual_explain", domains: ["schedule"] })),
    ).toBeNull();
  });

  it("does not strip tools when sub-agent toolFilter returns true for everything", () => {
    const state = createInitialAgentRunState({
      sessionId: 1,
      userMessage: "测试",
      history: [],
    });
    state.allowedToolNames = ["foo_tool", "bar_tool"];
    const noopAgent = {
      name: "noop",
      systemPromptSuffix: "noop suffix",
      toolFilter: () => true,
      domains: [] as string[],
    };
    applySubAgent(noopAgent, state, "base");
    expect(state.allowedToolNames).toEqual(["foo_tool", "bar_tool"]);
  });
});
