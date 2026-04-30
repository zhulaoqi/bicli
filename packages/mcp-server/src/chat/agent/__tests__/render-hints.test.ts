import { describe, expect, it } from "vitest";
import { computeRenderHints } from "../render-hints.js";
import { createInitialAgentRunState, type AgentRunState } from "../agent-state.js";

function makeState(overrides: Partial<AgentRunState> = {}): AgentRunState {
  const state = createInitialAgentRunState({ sessionId: 1, userMessage: "x", history: [] });
  state.route = {
    route: "realtime_query",
    confidence: 1,
    domains: [],
    needsKnowledge: false,
    needsUserConfirm: false,
    reasoning: "test",
  };
  return Object.assign(state, overrides);
}

describe("computeRenderHints", () => {
  it("visual_explain → preferMermaid + suppressMarkdownTable", () => {
    const state = makeState();
    state.route.route = "visual_explain";
    expect(computeRenderHints(state)).toMatchObject({
      preferMermaid: true,
      suppressMarkdownTable: true,
    });
  });

  it("write_action → highlightConfirmation", () => {
    const state = makeState();
    state.route.route = "write_action";
    expect(computeRenderHints(state)).toMatchObject({ highlightConfirmation: true });
  });

  it("diagnosis → preferSteps", () => {
    const state = makeState();
    state.route.route = "diagnosis";
    expect(computeRenderHints(state)).toMatchObject({ preferSteps: true });
  });

  it("knowledge → preferSteps", () => {
    const state = makeState();
    state.route.route = "knowledge";
    expect(computeRenderHints(state)).toMatchObject({ preferSteps: true });
  });

  it("realtime_query without mermaid → no hints", () => {
    const state = makeState();
    expect(computeRenderHints(state)).toEqual({});
  });

  it("finalText contains mermaid block → forces preferMermaid", () => {
    const state = makeState();
    state.finalText = "下面是流程：\n```mermaid\nflowchart LR\nA-->B\n```";
    expect(computeRenderHints(state)).toMatchObject({ preferMermaid: true });
  });
});
