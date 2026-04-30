import { describe, expect, it, vi } from "vitest";
import { runAct, runActRepair, runAgentLoop } from "../agent-runner.js";
import { runFinalize } from "../finalizer.js";
import { createInitialAgentRunState, type AgentRunState } from "../agent-state.js";
import type { AgentDeps } from "../agent-deps.js";
import type { StreamToolSpec } from "../../stream.js";

function makeState(overrides: Partial<AgentRunState> = {}): AgentRunState {
  const state = createInitialAgentRunState({
    sessionId: 1,
    userMessage: "查一下定时任务列表",
    history: [],
    pageContextEvidence: false,
  });
  state.allowedToolNames = ["dataeye_schedule_list"];
  state.route = {
    route: "realtime_query",
    confidence: 0.8,
    domains: ["schedule"],
    needsKnowledge: false,
    needsUserConfirm: false,
    reasoning: "test",
  };
  return Object.assign(state, overrides);
}

function fakeRes(): { res: any; events: Array<{ event: string; data: any }> } {
  const events: Array<{ event: string; data: any }> = [];
  let pendingEvent: string | null = null;
  const res = {
    write: (chunk: string) => {
      const eventMatch = chunk.match(/^event:\s*(\w+)/);
      if (eventMatch) {
        pendingEvent = eventMatch[1];
        return;
      }
      const dataMatch = chunk.match(/^data:\s*(.*)/);
      if (dataMatch && pendingEvent) {
        try {
          events.push({ event: pendingEvent, data: JSON.parse(dataMatch[1]) });
        } catch {
          events.push({ event: pendingEvent, data: dataMatch[1] });
        }
        pendingEvent = null;
      }
    },
  };
  return { res, events };
}

function makeStreamTextMock(events: Array<any>) {
  return vi.fn(() => ({
    fullStream: (async function* () {
      for (const ev of events) {
        yield ev;
      }
    })(),
  }));
}

describe("runAct", () => {
  it("only passes allowed tools to streamText", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
      { name: "dataeye_schedule_delete", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
    ];

    const streamTextMock = makeStreamTextMock([]);
    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runAct(state, deps);

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const passedTools = streamTextMock.mock.calls[0][0].tools;
    expect(Object.keys(passedTools)).toEqual(["dataeye_schedule_list"]);
    expect(state.telemetry.actMs).toBeGreaterThanOrEqual(0);
  });

  it("emits tool_start / tool_result SSE and updates state.toolCalls", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      {
        name: "dataeye_schedule_list",
        description: "",
        inputSchema: { type: "object" },
        execute: async () => `{"success":true,"data":{"total":3}}`,
      },
    ];

    const events = [
      { type: "tool-call", toolCallId: "c1", toolName: "dataeye_schedule_list", input: { page: 1 } },
      { type: "tool-result", toolCallId: "c1", toolName: "dataeye_schedule_list", output: `{"success":true,"data":{"total":3}}` },
    ];
    const streamTextMock = makeStreamTextMock(events);
    const { res, events: sseEvents } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runAct(state, deps);

    expect(sseEvents.map((e) => e.event)).toEqual(["tool_start", "tool_result"]);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].status).toBe("done");
    expect(state.toolCalls[0].name).toBe("dataeye_schedule_list");
  });

  it("captures act text into state.actText without emitting text_delta SSE", async () => {
    const state = makeState();
    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
    ];

    const events = [
      { type: "text-delta", text: "我正在查询..." },
    ];
    const streamTextMock = makeStreamTextMock(events);
    const { res, events: sseEvents } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runAct(state, deps);

    expect(state.actText).toBe("我正在查询...");
    expect(sseEvents.find((e) => e.event === "text_delta")).toBeUndefined();
  });

  it("skips streamText entirely when no tools are allowed", async () => {
    const state = makeState();
    state.allowedToolNames = [];

    const streamTextMock = makeStreamTextMock([]);
    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs: [],
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runAct(state, deps);

    expect(streamTextMock).not.toHaveBeenCalled();
  });
});

describe("runFinalize", () => {
  it("invokes streamText without tools and emits text_delta SSE", async () => {
    const state = makeState();
    state.toolCalls = [
      {
        id: "c1",
        name: "dataeye_schedule_detail",
        args: {},
        status: "done",
        duration: 12,
        result: JSON.stringify({
          success: true,
          data: { schedule: { name: "DailyReport", active: true, type: "EMAIL", cronExpression: "0 9 * * *" } },
        }),
      },
    ];

    const events = [
      { type: "text-delta", text: "定时任务 DailyReport " },
      { type: "text-delta", text: "状态：运行中，cron 0 9 * * *" },
    ];
    const streamTextMock = makeStreamTextMock(events);
    const { res, events: sseEvents } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs: [],
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runFinalize(state, deps);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
    // 工具结果摘要必须出现在 messages 里
    const lastMessage = call.messages[call.messages.length - 1];
    expect(lastMessage.content).toContain("dataeye_schedule_detail");
    // SSE 必须发出 text_delta
    expect(sseEvents.filter((e) => e.event === "text_delta")).toHaveLength(2);
    expect(state.finalText).toContain("DailyReport");
    expect(state.telemetry.finalizeRan).toBe(true);
  });

  it("falls back to deterministic summary when model returns empty text", async () => {
    const state = makeState();
    state.toolCalls = [
      {
        id: "c1",
        name: "dataeye_schedule_detail",
        args: {},
        status: "done",
        duration: 12,
        result: JSON.stringify({
          success: true,
          data: { schedule: { name: "DailyReport", active: true, type: "EMAIL", cronExpression: "0 9 * * *" } },
        }),
      },
    ];

    const streamTextMock = makeStreamTextMock([]);
    const { res, events: sseEvents } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs: [],
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runFinalize(state, deps);

    expect(state.finalText).toContain("已调用工具");
    expect(state.finalText).toContain("DailyReport");
    expect(state.telemetry.finalizeRan).toBe(false);
    // SSE 也发了一段 text_delta（fallback 也走 text_delta）
    expect(sseEvents.filter((e) => e.event === "text_delta")).toHaveLength(1);
  });

  it("no tool calls + empty model output => generic empty-response warning", async () => {
    const state = makeState();
    state.toolCalls = [];

    const streamTextMock = makeStreamTextMock([]);
    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs: [],
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runFinalize(state, deps);

    expect(state.finalText).toContain("模型未返回任何内容");
  });

  it("uses route-specific prompt addendum (visual_explain → Mermaid)", async () => {
    const state = makeState();
    state.route.route = "visual_explain";

    const streamTextMock = makeStreamTextMock([{ type: "text-delta", text: "ok" }]);
    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs: [],
      maxSteps: 3,
      streamTextImpl: streamTextMock,
    };

    await runFinalize(state, deps);
    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toContain("Mermaid");
  });
});

describe("runActRepair", () => {
  it("invokes generateText with toolChoice=required and merges results into state", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
    ];

    const generateTextMock = vi.fn().mockResolvedValue({
      text: "查询完毕",
      toolCalls: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", input: {} }],
      steps: [
        {
          toolCalls: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", input: { page: 1 } }],
          toolResults: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", output: '{"success":true,"data":{"total":2}}' }],
        },
      ],
    });

    const { res, events } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      generateTextImpl: generateTextMock,
    };

    const outcome = await runActRepair(state, deps);
    expect(outcome).not.toBeNull();
    expect(outcome!.toolCount).toBe(1);
    expect(generateTextMock.mock.calls[0][0].toolChoice).toBe("required");
    expect(state.toolCalls.find((c) => c.id === "r1")?.status).toBe("done");
    expect(state.telemetry.repairCount).toBe(1);
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["tool_start", "tool_result"]));
  });

  it("returns null and does not bump repairCount above limit when no tool calls produced", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
    ];

    const generateTextMock = vi.fn().mockResolvedValue({
      text: "(no tools)",
      toolCalls: [],
      steps: [],
    });

    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      generateTextImpl: generateTextMock,
    };
    const outcome = await runActRepair(state, deps);
    expect(outcome).toBeNull();
    expect(state.telemetry.repairCount).toBe(1);
  });
});

describe("runAgentLoop", () => {
  it("happy path: act + finalize, reflect ok, no repair", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => `{"success":true,"data":{"total":3}}` },
    ];

    const streamTextMock = vi.fn();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "tool-call", toolCallId: "c1", toolName: "dataeye_schedule_list", input: {} };
        yield { type: "tool-result", toolCallId: "c1", toolName: "dataeye_schedule_list", output: '{"success":true,"data":{"total":3}}' };
      })(),
    }));
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "共有 3 个任务" };
      })(),
    }));

    const generateTextMock = vi.fn();
    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
      generateTextImpl: generateTextMock,
    };

    const verdict = await runAgentLoop(state, deps);
    expect(verdict.verdict).toBe("ok");
    expect(state.finalText).toContain("3 个任务");
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(state.telemetry.repairCount).toBe(0);
  });

  it("repair path: act has 0 tool calls, repair fills tools, finalize succeeds", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => `{"success":true,"data":{"total":2}}` },
    ];

    const streamTextMock = vi.fn();
    // first finalize returns generic text
    streamTextMock.mockImplementationOnce(() => ({ fullStream: (async function* () {})() })); // act: no tool calls
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "我猜有 5 个任务" }; // hallucinated text triggering needs_repair
      })(),
    }));
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "实际查询到 2 个任务" };
      })(),
    }));

    const generateTextMock = vi.fn().mockResolvedValue({
      text: "查询完成",
      toolCalls: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", input: {} }],
      steps: [
        {
          toolCalls: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", input: {} }],
          toolResults: [{ toolCallId: "r1", toolName: "dataeye_schedule_list", output: '{"success":true,"data":{"total":2}}' }],
        },
      ],
    });

    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
      generateTextImpl: generateTextMock,
    };

    const verdict = await runAgentLoop(state, deps);
    expect(state.telemetry.repairCount).toBe(1);
    expect(verdict.verdict).toBe("ok");
    expect(state.finalText).toContain("2 个任务");
  });

  it("repair fails (no tools called) => verdict=fallback, finalText preserved", async () => {
    const state = makeState();
    state.allowedToolNames = ["dataeye_schedule_list"];

    const toolSpecs: StreamToolSpec[] = [
      { name: "dataeye_schedule_list", description: "", inputSchema: { type: "object" }, execute: async () => "{}" },
    ];

    const streamTextMock = vi.fn();
    streamTextMock.mockImplementationOnce(() => ({ fullStream: (async function* () {})() })); // act: 0 tools
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "本轮无数据可显示" };
      })(),
    }));

    const generateTextMock = vi.fn().mockResolvedValue({ text: "", toolCalls: [], steps: [] });

    const { res } = fakeRes();
    const deps: AgentDeps = {
      llm: {} as any,
      systemPrompt: "sys",
      res,
      toolSpecs,
      maxSteps: 3,
      streamTextImpl: streamTextMock,
      generateTextImpl: generateTextMock,
    };

    const verdict = await runAgentLoop(state, deps);
    expect(verdict.verdict).toBe("fallback");
    expect(verdict.reasons).toContain("repair_failed");
    expect(state.telemetry.repairCount).toBe(1);
  });
});
