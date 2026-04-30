import { tool as defineTool, jsonSchema, stepCountIs } from "ai";
import type { Tool } from "ai";
import type { AgentRunState } from "./agent-state.js";
import type { AgentDeps } from "./agent-deps.js";
import { emitSse } from "./agent-deps.js";
import type { ToolCallRecord } from "../session-store.js";
import { extractStructuredToolArtifacts } from "../message-blocks.js";

const ACT_PROMPT_SUFFIX = `

【Act 阶段提示】
1. 只负责调用工具收集事实，不要在本轮输出最终自然语言回答。
2. 工具执行完成后，系统会在下一阶段（Finalize）让你基于工具结果生成回复。
3. 如果当前问题已经可以直接回答（例如概念解释），可以保持不调用工具；但**不要**复读历史数据或推断未验证的根因。
`;

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

  const result = streamTextFn({
    model: deps.llm,
    system: deps.systemPrompt + ACT_PROMPT_SUFFIX,
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

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        state.actText += part.text;
        break;
      case "tool-call": {
        toolStartTimes[part.toolCallId] = Date.now();
        state.toolCalls.push({
          id: part.toolCallId,
          name: part.toolName,
          args: part.input,
          status: "running",
        });
        emitSse(deps.res, "tool_start", {
          id: part.toolCallId,
          name: part.toolName,
          args: part.input,
        });
        break;
      }
      case "tool-result": {
        const duration = Date.now() - (toolStartTimes[part.toolCallId] || Date.now());
        const rec = state.toolCalls.find((r) => r.id === part.toolCallId);
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

  state.telemetry.actMs = Date.now() - start;
}

async function executeToolSpec(
  spec: { name: string; execute: (args: Record<string, unknown>) => Promise<string> },
  args: any,
  state: AgentRunState,
  deps: AgentDeps,
): Promise<string> {
  try {
    const raw = await spec.execute(args ?? {});
    let resultForLLM = raw;
    if (typeof raw === "string") {
      const { blocks, chart, resultForLLM: withoutArtifacts } = extractStructuredToolArtifacts(raw);
      if (blocks.length > 0) {
        for (const block of blocks) {
          const normalizedBlock = {
            ...block,
            sourceTool: block.sourceTool ?? spec.name,
          };
          state.collectedArtifacts.push({ type: "block", sourceTool: spec.name });
          emitSse(deps.res, "message_block", normalizedBlock);
        }
      }
      if (chart && typeof chart === "object") {
        const chartPayload = {
          toolCallId: spec.name + "_" + Date.now(),
          toolName: spec.name,
          ...(chart as Record<string, unknown>),
        };
        state.collectedArtifacts.push({ type: "chart", sourceTool: spec.name });
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
