import { describe, expect, it, vi } from "vitest";
import { runCritique, shouldRunCritique } from "../critique.js";
import { createInitialAgentRunState, type AgentRunState } from "../agent-state.js";
import type { AgentDeps } from "../agent-deps.js";

function makeState(overrides: Partial<AgentRunState> = {}): AgentRunState {
  const state = createInitialAgentRunState({
    sessionId: 1,
    userMessage: "test",
    history: [],
  });
  state.route = {
    route: "diagnosis",
    confidence: 0.8,
    domains: [],
    needsKnowledge: false,
    needsUserConfirm: false,
    reasoning: "test",
  };
  return Object.assign(state, overrides);
}

describe("shouldRunCritique", () => {
  it("returns true for diagnosis route", () => {
    const state = makeState();
    state.route.route = "diagnosis";
    expect(shouldRunCritique(state)).toBe(true);
  });

  it("returns true for write_action route", () => {
    const state = makeState();
    state.route.route = "write_action";
    expect(shouldRunCritique(state)).toBe(true);
  });

  it("returns false for realtime_query route by default", () => {
    const state = makeState();
    state.route.route = "realtime_query";
    expect(shouldRunCritique(state)).toBe(false);
  });

  it("respects AGENT_CRITIQUE_ALL=1 to enable for all routes", () => {
    const state = makeState();
    state.route.route = "knowledge";
    const prev = process.env.AGENT_CRITIQUE_ALL;
    process.env.AGENT_CRITIQUE_ALL = "1";
    try {
      expect(shouldRunCritique(state)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.AGENT_CRITIQUE_ALL;
      else process.env.AGENT_CRITIQUE_ALL = prev;
    }
  });

  it("respects AGENT_CRITIQUE=0 to disable globally", () => {
    const state = makeState();
    state.route.route = "diagnosis";
    const prev = process.env.AGENT_CRITIQUE;
    process.env.AGENT_CRITIQUE = "0";
    try {
      expect(shouldRunCritique(state)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.AGENT_CRITIQUE;
      else process.env.AGENT_CRITIQUE = prev;
    }
  });
});

describe("runCritique", () => {
  it("parses passed=true response", async () => {
    const state = makeState();
    state.finalText = "查询返回 0 条数据。";
    const generateTextMock = vi.fn().mockResolvedValue({
      text: '{"passed": true, "issues": [], "reasoning": "answer cites tool"}',
    });
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "",
      res: { write: () => {} } as any,
      toolSpecs: [],
      maxSteps: 1,
      generateTextImpl: generateTextMock,
    };
    const result = await runCritique(state, deps);
    expect(result?.passed).toBe(true);
    expect(state.telemetry.critiqueCount).toBe(1);
  });

  it("parses passed=false with suggestion", async () => {
    const state = makeState();
    state.finalText = "可能是 SDK 没接入";
    const generateTextMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        passed: false,
        issues: ["unverified root cause"],
        suggestion: "工具未返回任何事件证据，建议先查事件配置。",
        reasoning: "no evidence of SDK status",
      }),
    });
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "",
      res: { write: () => {} } as any,
      toolSpecs: [],
      maxSteps: 1,
      generateTextImpl: generateTextMock,
    };
    const result = await runCritique(state, deps);
    expect(result?.passed).toBe(false);
    expect(result?.suggestion).toContain("事件配置");
    expect(result?.issues).toContain("unverified root cause");
  });

  it("returns null when LLM gives malformed JSON", async () => {
    const state = makeState();
    const generateTextMock = vi.fn().mockResolvedValue({
      text: "not a json",
    });
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "",
      res: { write: () => {} } as any,
      toolSpecs: [],
      maxSteps: 1,
      generateTextImpl: generateTextMock,
    };
    const result = await runCritique(state, deps);
    expect(result).toBeNull();
  });

  it("times out gracefully when LLM hangs", async () => {
    const state = makeState();
    const generateTextMock = vi.fn(() => new Promise(() => {}));
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "",
      res: { write: () => {} } as any,
      toolSpecs: [],
      maxSteps: 1,
      generateTextImpl: generateTextMock,
    };
    const result = await runCritique(state, deps, 30);
    expect(result).toBeNull();
  });
});
