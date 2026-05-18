import { tool as defineTool, jsonSchema, stepCountIs } from "ai";
import type { Tool } from "ai";
import type { AgentRunState, ReflectVerdict } from "./agent-state.js";
import type { AgentDeps } from "./agent-deps.js";
import { emitSse } from "./agent-deps.js";
import type { ToolCallRecord } from "../session-store.js";
import { extractStructuredToolArtifacts } from "../message-blocks.js";
import { runFinalize } from "./finalizer.js";
import { runReflect } from "./reflector.js";
import { computeRenderHints } from "./render-hints.js";
import { runCritique, shouldRunCritique } from "./critique.js";
import { pickSubAgent, applySubAgent } from "./sub-agents/sub-agent.js";
import {
  emitBlockedToolResult,
  finalizeOrphanedToolCalls,
  withToolExecuteTimeout,
} from "./tool-guard.js";

function buildActPromptSuffix(allowedToolNames: string[]): string {
  const list =
    allowedToolNames.length > 0 && allowedToolNames.length <= 40
      ? allowedToolNames.join(", ")
      : allowedToolNames.length > 40
        ? `${allowedToolNames.slice(0, 40).join(", ")} …共${allowedToolNames.length}个`
        : "（无）";
  return `

【Act 阶段提示】
1. 只负责调用工具收集事实，不要在本轮输出最终自然语言回答。
2. 工具执行完成后，系统会在下一阶段（Finalize）让你基于工具结果生成回复。
3. 如果当前问题已经可以直接回答（例如概念解释），可以保持不调用工具；但**不要**复读历史数据或推断未验证的根因。
4. **仅可调用以下已开放工具**（其它名称不会执行）：${list}
`;
}

const DEFAULT_MAX_TOOL_RESULT = 6000;

/**
 * Act 阶段：跑工具循环。
 *
 * 输出位置：
 * - state.toolCalls: 完整的工具调用记录（含 status/duration/result）
 * - state.collectedArtifacts: 工具结构化产物的引用元信息
 * - state.actText: 流过程中的零散文本（一般为空，finalize 阶段才负责回答）
 * - state.telemetry.actMs: 总耗时
 *
 * SSE 行为：
 * - 工具相关：发送 tool_start / tool_result / message_block / chart_data
 * - 文本：本阶段不发送 text_delta（避免提前向用户暴露未基于工具结果的内容）
 */
export async function runAct(state: AgentRunState, deps: AgentDeps): Promise<void> {
  const start = Date.now();
  const allowedSpecs = deps.toolSpecs.filter((t) => state.allowedToolNames.includes(t.name));
  const allowedSet = new Set(state.allowedToolNames);

  const aiTools: Record<string, Tool<any, any>> = {};
  for (const t of allowedSpecs) {
    aiTools[t.name] = defineTool<any, string>({
      description: t.description,
      inputSchema: jsonSchema<any>(t.inputSchema ?? { type: "object" }),
      execute: async (args: any) => executeToolSpec(t, args, state, deps),
    });
  }

  const messages = [
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: state.userMessage },
  ];

  state.messages = messages as any;

  if (Object.keys(aiTools).length === 0) {
    // 没有可用工具时，act 直接跳过，由 finalize 直接回答
    state.telemetry.actMs = Date.now() - start;
    return;
  }

  const streamTextFn = deps.streamTextImpl ?? (await import("ai")).streamText;
  const toolStartTimes: Record<string, number> = {};

  const actSuffix = buildActPromptSuffix(state.allowedToolNames);

  const result = streamTextFn({
    model: deps.llm,
    system: deps.systemPrompt + actSuffix,
    messages: messages as any,
    tools: aiTools,
    toolChoice: "auto",
    stopWhen: stepCountIs(deps.maxSteps),
    onStepFinish: ({ toolCalls, text, finishReason, usage }: any) => {
      console.log(
        `[agent.act] finishReason=${finishReason} ` +
        `toolCalls=${toolCalls?.length ?? 0} textLen=${text?.length ?? 0} ` +
        `usage=${JSON.stringify(usage ?? {})}`,
      );
    },
  });

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          state.actText += part.text;
          break;
        case "tool-call": {
          toolStartTimes[part.toolCallId] = Date.now();
          const rec: ToolCallRecord = {
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
            status: "running",
          };
          state.toolCalls.push(rec);
          emitSse(deps.res, "tool_start", {
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          });
          if (!allowedSet.has(part.toolName)) {
            const duration = Date.now() - (toolStartTimes[part.toolCallId] || Date.now());
            emitBlockedToolResult(deps.res, part.toolCallId, part.toolName, rec, duration);
          }
          break;
        }
        case "tool-result": {
          const duration = Date.now() - (toolStartTimes[part.toolCallId] || Date.now());
          const rec = state.toolCalls.find((r) => r.id === part.toolCallId);
          if (rec?.status === "error" && rec.result?.includes("TOOL_NOT_ALLOWED")) {
            break;
          }
          let toolSuccess = true;
          try {
            const parsed = typeof part.output === "string" ? JSON.parse(part.output) : part.output;
            toolSuccess = parsed?.success !== false;
          } catch { /* ignore parse error */ }
          if (rec) {
            rec.result = part.output;
            rec.duration = duration;
            rec.status = toolSuccess ? "done" : "error";
          }
          emitSse(deps.res, "tool_result", {
            id: part.toolCallId,
            name: part.toolName,
            result: part.output,
            duration,
            status: toolSuccess ? "done" : "error",
          });
          break;
        }
        case "error":
          emitSse(deps.res, "error", { message: String(part.error) });
          break;
      }
    }
  } finally {
    const orphans = finalizeOrphanedToolCalls(state.toolCalls, deps.res);
    if (orphans > 0) {
      console.warn(`[agent.act] finalized ${orphans} orphaned tool call(s)`);
    }
  }

  state.telemetry.actMs = Date.now() - start;
}

async function executeToolSpec(
  spec: { name: string; execute: (args: Record<string, unknown>) => Promise<string> },
  args: any,
  state: AgentRunState,
  deps: AgentDeps,
): Promise<string> {
  try {
    const raw = await withToolExecuteTimeout(
      spec.execute(args ?? {}),
      spec.name,
    );
    let resultForLLM = raw;
    if (typeof raw === "string") {
      const { blocks, chart, resultForLLM: withoutArtifacts } = extractStructuredToolArtifacts(raw);
      if (blocks.length > 0) {
        for (const block of blocks) {
          const normalizedBlock = {
            ...block,
            sourceTool: block.sourceTool ?? spec.name,
          };
          state.collectedBlocks.push(normalizedBlock);
          emitSse(deps.res, "message_block", normalizedBlock);
        }
      }
      if (chart && typeof chart === "object") {
        const chartPayload = {
          toolCallId: spec.name + "_" + Date.now(),
          toolName: spec.name,
          ...(chart as Record<string, unknown>),
        };
        state.collectedCharts.push(chartPayload);
        emitSse(deps.res, "chart_data", chartPayload);
      }
      resultForLLM = String(withoutArtifacts);
    }
    const max = deps.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT;
    if (typeof resultForLLM === "string" && resultForLLM.length > max) {
      console.warn(`[agent.act] tool ${spec.name} result truncated: ${resultForLLM.length} → ${max} chars`);
      return resultForLLM.slice(0, max) + `\n... [结果已截断，共 ${resultForLLM.length} 字符，仅保留前 ${max}]`;
    }
    return String(resultForLLM ?? "");
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    });
  }
}

const REPAIR_PROMPT_SUFFIX = `

⛔ [系统自动纠偏]
上一轮判定为：未调用工具 / 工具失败被忽略 / 列表幻觉。
本轮强制要求：
1. 必须调用相关工具获取实时/真实数据；
2. 只能基于工具返回值作答，严禁凭记忆复述。
`;

const DEFAULT_REPAIR_TIMEOUT_MS = 25000;
const DEFAULT_REPAIR_MAX_STEPS = 5;

export interface RunActRepairOptions {
  /** 默认 25s */
  timeoutMs?: number;
  /** 默认 5 步 */
  maxSteps?: number;
  /** force tool 选择策略，默认 "required" */
  toolChoice?: "required" | "auto";
}

/**
 * Repair 阶段：用 toolChoice=required 强制再走一次工具调用，把结果合并到 state.toolCalls。
 *
 * 与原 `runRepairRound` 的差别：
 * - 直接接收 AgentRunState（共享 history/userMessage/route/allowedTools）
 * - SSE 直接补发 tool_start / tool_result（兼容 retroactive 展示）
 * - 不返回最终文本（finalize 阶段统一负责）
 * - 增加 telemetry.repairCount
 */
export async function runActRepair(
  state: AgentRunState,
  deps: AgentDeps,
  options: RunActRepairOptions = {},
): Promise<{ toolCount: number; text: string } | null> {
  const start = Date.now();
  const allowedSpecs = deps.toolSpecs.filter((t) => state.allowedToolNames.includes(t.name));
  if (allowedSpecs.length === 0) {
    console.warn("[agent.repair] no allowed tools, skipping");
    return null;
  }

  const aiTools: Record<string, Tool<any, any>> = {};
  for (const t of allowedSpecs) {
    aiTools[t.name] = defineTool<any, string>({
      description: t.description,
      inputSchema: jsonSchema<any>(t.inputSchema ?? { type: "object" }),
      execute: async (args: any) => executeToolSpec(t, args, state, deps),
    });
  }

  const repairSystem = deps.systemPrompt + REPAIR_PROMPT_SUFFIX;
  const messages = [
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: state.userMessage },
  ];

  const generateTextFn = deps.generateTextImpl ?? (await import("ai")).generateText;

  const timeoutMs = options.timeoutMs ?? DEFAULT_REPAIR_TIMEOUT_MS;
  const maxSteps = options.maxSteps ?? DEFAULT_REPAIR_MAX_STEPS;

  const doRepair = async (): Promise<{ toolCount: number; text: string } | null> => {
    const result: any = await generateTextFn({
      model: deps.llm,
      system: repairSystem,
      messages: messages as any,
      tools: aiTools,
      toolChoice: options.toolChoice ?? "required",
      maxSteps,
    });
    const toolCount = (result.toolCalls?.length ?? 0) as number;
    if (toolCount === 0) {
      console.warn("[agent.repair] generateText completed but no tool calls were made");
      return null;
    }
    const rawSteps: any[] = result.steps ?? [];
    for (const step of rawSteps) {
      const calls = step.toolCalls ?? [];
      const results = step.toolResults ?? [];
      for (const c of calls) {
        const id = c.toolCallId ?? c.id ?? `repair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const name = c.toolName ?? c.name ?? "";
        const input = c.input ?? c.args ?? {};
        emitSse(deps.res, "tool_start", { id, name, args: input });
        state.toolCalls.push({ id, name, args: input, status: "running" });
      }
      for (const r of results) {
        const id = r.toolCallId ?? r.id ?? "";
        const name = r.toolName ?? r.name ?? "";
        const output = r.output ?? r.result ?? "";
        emitSse(deps.res, "tool_result", { id, name, result: output, duration: 0, status: "done" });
        const rec = state.toolCalls.find((rec) => rec.id === id && rec.name === name);
        if (rec) {
          rec.result = output;
          rec.status = "done";
        }
      }
    }
    return { toolCount, text: typeof result.text === "string" ? result.text : "" };
  };

  let outcome: { toolCount: number; text: string } | null = null;
  try {
    outcome = await Promise.race([
      doRepair(),
      new Promise<null>((resolve) => setTimeout(() => {
        console.warn(`[agent.repair] timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs)),
    ]);
  } catch (err) {
    console.warn("[agent.repair] threw:", err instanceof Error ? err.message : String(err));
    outcome = null;
  } finally {
    const orphans = finalizeOrphanedToolCalls(state.toolCalls, deps.res);
    if (orphans > 0) {
      console.warn(`[agent.repair] finalized ${orphans} orphaned tool call(s)`);
    }
  }

  state.telemetry.repairCount += 1;
  state.telemetry.repairMs += Date.now() - start;
  return outcome;
}

const DEFAULT_MAX_REPAIRS = 1;

/**
 * 顶层 orchestration: Router → Act → Finalize → Reflect →（可选 Repair → Finalize → Reflect）。
 * Render 阶段 hint 由调用方在 finalize 后单独补；这里只完成"决定 finalText"的部分。
 */
export async function runAgentLoop(state: AgentRunState, deps: AgentDeps): Promise<ReflectVerdict> {
  const sub = pickSubAgent(state.route);
  if (sub) {
    const { systemPrompt } = applySubAgent(sub, state, deps.systemPrompt);
    deps = { ...deps, systemPrompt };
    console.log(
      `[agent.loop] sub-agent=${sub.name} allowedTools=${state.allowedToolNames.length}`,
    );
  }

  await runAct(state, deps);
  await runFinalize(state, deps);
  let verdict = runReflect(state);

  const maxRepairs = Number(process.env.AGENT_MAX_REPAIRS) || DEFAULT_MAX_REPAIRS;

  while (verdict.verdict === "needs_repair" && state.telemetry.repairCount < maxRepairs) {
    console.warn(`[agent.loop] reflect verdict=needs_repair reasons=${verdict.reasons.join(",")}, starting repair round`);
    const repair = await runActRepair(state, deps);
    if (!repair || repair.toolCount === 0) {
      // repair 失败：保留当前 finalText，但把 verdict 降级为 fallback 提示
      verdict = {
        verdict: "fallback",
        reasons: [...verdict.reasons, "repair_failed"],
        text: "⚠️ 工具未能完成此次请求，请稍后重试或换用其他模型。",
      };
      break;
    }
    state.finalText = "";
    await runFinalize(state, deps);
    verdict = runReflect(state);
  }

  if (verdict.verdict === "fallback" && verdict.text) {
    state.finalText = verdict.text;
    // finalize 阶段可能已经输出了有问题文本，fallback 必须显式覆盖前端已渲染内容。
    emitSse(deps.res, "text_replace", { content: state.finalText });
  }
  state.reflectVerdict = verdict;

  // 模型 critique 仅在指定 route 触发，且 reflect 已 ok 时（避免把 fallback 文本送给 critique）
  if (verdict.verdict === "ok" && shouldRunCritique(state)) {
    try {
      const critique = await runCritique(state, deps);
      if (critique && !critique.passed) {
        const issuesText = critique.issues.length > 0 ? `\n\n[critique 标记]: ${critique.issues.join("; ")}` : "";
        if (critique.suggestion && critique.suggestion.length > 0) {
          state.finalText = critique.suggestion + issuesText;
          emitSse(deps.res, "text_replace", { content: state.finalText });
        }
      }
    } catch (err) {
      console.warn("[agent.loop] critique threw:", err instanceof Error ? err.message : String(err));
    }
  }

  // Render hints：finalize 完成后再算（这样能感知 finalText 中的 mermaid 等内容）
  state.renderHints = computeRenderHints(state);
  if (Object.keys(state.renderHints).length > 0) {
    emitSse(deps.res, "agent_render_hint", state.renderHints);
  }

  if (process.env.AGENT_TRACE !== "off") {
    try {
      emitSse(deps.res, "agent_trace", buildTracePayload(state));
    } catch (err) {
      console.warn("[agent.loop] failed to emit agent_trace:", err instanceof Error ? err.message : String(err));
    }
  }

  return verdict;
}

/**
 * 把 AgentRunState 摘要成前端调试面板可消费的轻量结构。
 * 不包含敏感参数 / 完整工具结果，只暴露必要的诊断信息。
 */
export function buildTracePayload(state: AgentRunState) {
  return {
    route: {
      route: state.route.route,
      confidence: state.route.confidence,
      domains: state.route.domains,
      needsKnowledge: state.route.needsKnowledge,
      needsUserConfirm: state.route.needsUserConfirm,
      reasoning: state.route.reasoning,
    },
    allowedToolNames: state.allowedToolNames,
    forbiddenToolNames: state.forbiddenToolNames,
    toolCallCount: state.toolCalls.length,
    toolCalls: state.toolCalls.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      duration: c.duration,
    })),
    finalizeRan: state.telemetry.finalizeRan,
    reflectVerdict: state.reflectVerdict.verdict,
    reflectReasons: state.reflectVerdict.reasons,
    repairCount: state.telemetry.repairCount,
    critiqueCount: state.telemetry.critiqueCount,
    routerSource: state.telemetry.routerSource,
    durations: {
      routerMs: state.telemetry.routerMs,
      actMs: state.telemetry.actMs,
      finalizeMs: state.telemetry.finalizeMs,
      reflectMs: state.telemetry.reflectMs,
      repairMs: state.telemetry.repairMs,
    },
    renderHints: state.renderHints,
  };
}

/** 用于 Reflect / Finalize 阶段：把工具结果浓缩成短摘要供模型继续使用。 */
export function summarizeToolCallsForPrompt(toolCalls: ToolCallRecord[], maxChars = 4000): string {
  if (toolCalls.length === 0) return "(本轮未调用任何工具)";
  const parts: string[] = [];
  for (const call of toolCalls) {
    const head = `# tool: ${call.name} status=${call.status ?? "?"} duration=${call.duration ?? "?"}ms`;
    let body = "";
    if (typeof call.result === "string") {
      body = call.result;
    } else if (call.result !== undefined) {
      try {
        body = JSON.stringify(call.result);
      } catch { body = String(call.result); }
    }
    if (body.length > 1500) body = body.slice(0, 1500) + " …[truncated]";
    parts.push([head, body].filter(Boolean).join("\n"));
  }
  let combined = parts.join("\n\n");
  if (combined.length > maxChars) {
    combined = combined.slice(0, maxChars) + "\n…[overall truncated]";
  }
  return combined;
}
