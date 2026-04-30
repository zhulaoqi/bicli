import type { LanguageModel } from "ai";
import { createModel, type ExtendedProvider } from "@bicli/core";
import type { CustomModelConfig } from "@bicli/core";
import type { Response } from "express";
import type { SessionStore, ToolCallRecord } from "./session-store.js";
import { extractFollowUps } from "./system-prompt.js";
import {
  sanitizeEmptyAnalysisSpeculation as reflectorSanitizeEmptyAnalysisSpeculation,
  sanitizeVisibleHistoryArtifacts as reflectorSanitizeVisibleHistoryArtifacts,
  buildToolResultFallback as reflectorBuildToolResultFallback,
} from "./agent/reflector.js";

import type { RouteName } from "./agent/agent-state.js";
import { createInitialAgentRunState } from "./agent/agent-state.js";
import { runRouter } from "./agent/intent-router.js";
import { selectToolsForRoute } from "./agent/tool-selector.js";
import { runAgentLoop } from "./agent/agent-runner.js";

export interface StreamToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Execute the tool. Should already have identity / token injected via closure by the caller.
   * Must return a plain string (the LLM-facing payload). The http-server layer is responsible
   * for unwrapping MCP { content: [{ type: 'text', text }] } into plain JSON strings.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
  /** 路由元数据：来自 ToolDef，缺省时 selector 用 default heuristic */
  routeHints?: RouteName[];
  knowledgeOnly?: boolean;
  destructive?: boolean | string[];
  tier?: "business" | "atomic" | "internal";
  domain?: string;
}

export interface StreamChatParams {
  res: Response;
  sessionId: number;
  userMessage: string;
  model: string;
  provider: ExtendedProvider;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tools: StreamToolSpec[];
  store: SessionStore;
  /** 兼容字段：旧 guard 已经在 reflector 中按 route 处理，此 flag 不再需要。保留以兼容 caller。 */
  skipNoToolListGuard?: boolean;
  hasPageContextEvidence?: boolean;
  maxSteps?: number;
  customConfig?: CustomModelConfig;
}

/**
 * @deprecated 旧的 stream guard 已经搬到 chat/agent/intent-router + chat/agent/reflector。
 * 仅留下兼容旧测试 / 旧调用者的最小实现（基于关键字粗略判断），不再参与主流程。
 */
export function shouldRequireToolCall(userMessage: string): boolean {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  if (!text) return false;

  const concreteDataMarkers = [
    /\b(id|ID)\s*[=:：]?\s*\d+\b/,
    /\d{3,}/,
    /当前页面|当前图|这个图|这个看板|这个分析|该产品|该项目|这个事件/,
    /结果|数量|多少|列表|明细|raw\s*data/i,
  ];
  const realtimeActionMarkers = [
    /执行|跑一下|运行|查一下|查询|查看|帮我看|列出|有哪些|有多少|统计|分析.*结果/,
    /下载|导出|分享|生成.*链接/,
  ];
  const helpOnlyMarkers = [
    /是什么|什么意思|概念|原理|怎么配置|如何配置|怎么使用|如何使用|说明|文档|教程|解释一下|流程|步骤|区别|最佳实践|接入/,
  ];

  const hasRealtimeAction = realtimeActionMarkers.some((pattern) => pattern.test(text));
  const hasConcreteData = concreteDataMarkers.some((pattern) => pattern.test(text));
  const helpOnly = helpOnlyMarkers.some((pattern) => pattern.test(text));

  if (helpOnly && !hasConcreteData) return false;
  if (hasRealtimeAction) return true;
  if (hasConcreteData && /为什么|为何|原因|异常|为空|没有数据|没数据|不显示/.test(text)) return true;
  if (hasConcreteData && /看板|分析|图表|事件|产品|项目|用户|角色|数据表/.test(text)) return true;
  if (/\b(my_|cgt|event|analysis|dashboard|chart)\b/i.test(lower) && hasConcreteData) return true;
  return false;
}

// 已迁移到 chat/agent/reflector.ts，这里保留 thin re-export 以兼容现有测试。
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const sanitizeEmptyAnalysisSpeculation = reflectorSanitizeEmptyAnalysisSpeculation;
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const sanitizeVisibleHistoryArtifacts = reflectorSanitizeVisibleHistoryArtifacts;
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const buildToolResultFallback = reflectorBuildToolResultFallback;

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * BiCLI 主聊天入口。
 *
 * 流程：
 *   持久化用户消息 → 创建模型 → Router → Selector → AgentLoop（Act/Finalize/Reflect/Repair）
 *   → followUps 抽取 → 历史持久化 → done。
 *
 * 旧的 fake_tool_call 检测、空响应兜底、列表幻觉拦截、历史截断标记清洗 等逻辑
 * 已迁移到 `chat/agent/reflector.ts` 与 `chat/agent/finalizer.ts`，此处不再重复。
 */
export async function handleChatStream(params: StreamChatParams): Promise<void> {
  const {
    res,
    sessionId,
    userMessage,
    model,
    provider,
    systemPrompt,
    history,
    tools,
    store,
    hasPageContextEvidence = false,
    maxSteps = 8,
    customConfig,
  } = params;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();

  await store.addMessage(sessionId, { role: "user", content: userMessage });

  let llm: LanguageModel;
  try {
    llm = createModel(provider, model, customConfig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sseSend(res, "error", { message: `模型创建失败: ${msg}` });
    res.end();
    return;
  }

  const state = createInitialAgentRunState({
    sessionId,
    userMessage,
    history,
    pageContextEvidence: hasPageContextEvidence,
  });

  let errored = false;

  try {
    state.route = await runRouter({
      userMessage,
      history,
      pageContextEvidence: hasPageContextEvidence,
    });

    const selection = selectToolsForRoute(tools, state.route);
    state.allowedToolNames = selection.allowed.map((t) => t.name);
    state.forbiddenToolNames = selection.forbidden;

    console.log(
      `[stream] route=${state.route.route} confidence=${state.route.confidence} ` +
      `domains=${state.route.domains.join(",") || "-"} ` +
      `allowedTools=${state.allowedToolNames.length}/${tools.length}`,
    );

    await runAgentLoop(state, {
      llm,
      systemPrompt,
      res,
      toolSpecs: tools,
      maxSteps,
      customConfig,
    });
  } catch (e) {
    errored = true;
    console.error("[stream] runAgentLoop threw:", e);
    sseSend(res, "error", { message: e instanceof Error ? e.message : String(e) });
  }

  let fullText = state.finalText;

  const { clean, followUps } = extractFollowUps(fullText);
  if (clean !== fullText) {
    sseSend(res, "text_replace", { content: clean });
    fullText = clean;
  }

  if (clean || state.toolCalls.length > 0) {
    // 历史消息截断：防止大量工具数据存入 history 被 LLM 复读
    const MAX_HISTORY_CONTENT = 400;
    let contentForHistory = clean;
    if (state.toolCalls.length > 0 && clean.length > MAX_HISTORY_CONTENT) {
      contentForHistory = clean.slice(0, MAX_HISTORY_CONTENT) +
        `\n\n<!--history_truncated chars=${clean.length} visible=false-->`;
    }
    await store.addMessage(sessionId, {
      role: "assistant",
      content: contentForHistory,
      toolCalls: state.toolCalls.length > 0 ? toolCallsForHistory(state.toolCalls) : null,
      blocks: state.collectedBlocks.length > 0 ? state.collectedBlocks : null,
      charts: state.collectedCharts.length > 0 ? state.collectedCharts : null,
    });
  }

  if (followUps.length > 0) {
    sseSend(res, "follow_ups", { questions: followUps });
  }

  if (!errored) {
    sseSend(res, "done", { sessionId });
  }

  res.end();
}

function toolCallsForHistory(calls: ToolCallRecord[]): ToolCallRecord[] {
  // 历史持久化时不想保留过大 result，截断到 1KB 以内
  return calls.map((c) => {
    if (typeof c.result === "string" && c.result.length > 1024) {
      return { ...c, result: c.result.slice(0, 1024) + "…[truncated]" };
    }
    return c;
  });
}
