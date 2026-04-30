/**
 * Agent Runtime Loop 公共类型定义。
 *
 * 五种语义路由：
 * - knowledge: 概念/流程/最佳实践/接入说明，应优先走知识工具或直接回答；不调用实时业务工具
 * - realtime_query: 查询当前/具体 ID/资源的实时数据
 * - write_action: 创建/修改/删除等写操作，必须经 dryRun + 用户确认
 * - diagnosis: 排错/为什么没有数据/为什么失败，强调以工具结果为唯一证据
 * - visual_explain: 用户期望可视化解释（流程图/架构图/状态机），优先 Mermaid
 */
export type RouteName =
  | "knowledge"
  | "realtime_query"
  | "write_action"
  | "diagnosis"
  | "visual_explain";

export interface RouteDecision {
  route: RouteName;
  /** 0..1，<0.5 视为模糊，调用方应做兜底处理 */
  confidence: number;
  /** 命中的业务领域，例如 ["schedule"]、["analysis", "dashboard"] */
  domains: string[];
  /** 是否需要知识工具参与 */
  needsKnowledge: boolean;
  /** 是否是写操作，需要用户显式确认 */
  needsUserConfirm: boolean;
  /** 路由的简短解释，便于 trace/调试 */
  reasoning: string;
}

export interface RenderHints {
  /** 强烈建议在最终回复里使用 Mermaid 图 */
  preferMermaid?: boolean;
  /** 强烈建议使用编号步骤而不是大段文字 */
  preferSteps?: boolean;
  /** 写操作需要把"待确认动作"显著高亮 */
  highlightConfirmation?: boolean;
  /** 抑制大型 Markdown 表格，优先使用 message_block / TableBlock */
  suppressMarkdownTable?: boolean;
}

export interface ReflectVerdict {
  verdict: "ok" | "needs_repair" | "fallback";
  reasons: string[];
  /** 当 verdict=fallback 时，reflect 给出的替换文本 */
  text?: string;
}

export interface AgentTelemetry {
  routerMs: number;
  actMs: number;
  finalizeMs: number;
  reflectMs: number;
  repairMs: number;
  repairCount: number;
  routerSource: "rule" | "rule+llm" | "cache";
  /** 模型 critique 调用次数 */
  critiqueCount: number;
  /** 是否 finalize 实际跑过（即模型返回了文本，不是兜底字符串） */
  finalizeRan: boolean;
}

/**
 * 引用结构性产物的轻量记录（不存原始数据，只存 SSE 已发送过的元信息）。
 * 真正的 MessageBlock / chart payload 仍由现有 `message-blocks.ts` / `result-block-factory.ts` 管理。
 */
export interface CollectedArtifact {
  type: "block" | "chart";
  /** 来源工具名 */
  sourceTool: string;
}

import type { ToolCallRecord } from "../session-store.js";

export interface AgentRunState {
  sessionId: number;
  userMessage: string;
  /** 是否已注入 page context evidence；router 可据此提升 realtime_query 置信度 */
  pageContextEvidence: boolean;
  /** 历史消息（按 [{role, content}, ...] 形式存储，与 stream 保持一致） */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Router 阶段输出 */
  route: RouteDecision;
  /** Selector 阶段输出的可见工具名集合（最终的、经过 route 裁剪） */
  allowedToolNames: string[];
  /** Selector 阶段被屏蔽的工具名（仅做 trace 记录） */
  forbiddenToolNames: string[];
  /** 工具循环过程中的 messages（包含 system / user / assistant / tool 等） */
  messages: Array<{ role: string; content: any }>;
  /** Act 阶段记录的工具调用 */
  toolCalls: ToolCallRecord[];
  /** Act 阶段产生的 message_block / chart 引用 */
  collectedArtifacts: CollectedArtifact[];
  /** Act 阶段模型同时输出的零散文字（一般为空，finalize 才负责生成最终回复） */
  actText: string;
  /** Finalize 阶段的最终自然语言回复 */
  finalText: string;
  /** Reflect 阶段裁定结果 */
  reflectVerdict: ReflectVerdict;
  /** 渲染建议 */
  renderHints: RenderHints;
  /** 计时与计数 */
  telemetry: AgentTelemetry;
}

const defaultRoute: RouteDecision = {
  route: "realtime_query",
  confidence: 0,
  domains: [],
  needsKnowledge: false,
  needsUserConfirm: false,
  reasoning: "uninitialized",
};

const defaultVerdict: ReflectVerdict = {
  verdict: "ok",
  reasons: [],
};

const defaultTelemetry: AgentTelemetry = {
  routerMs: 0,
  actMs: 0,
  finalizeMs: 0,
  reflectMs: 0,
  repairMs: 0,
  repairCount: 0,
  routerSource: "rule",
  critiqueCount: 0,
  finalizeRan: false,
};

export interface CreateAgentRunStateInput {
  sessionId: number;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pageContextEvidence?: boolean;
}

export function createInitialAgentRunState(input: CreateAgentRunStateInput): AgentRunState {
  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    pageContextEvidence: input.pageContextEvidence ?? false,
    history: input.history,
    route: { ...defaultRoute },
    allowedToolNames: [],
    forbiddenToolNames: [],
    messages: [],
    toolCalls: [],
    collectedArtifacts: [],
    actText: "",
    finalText: "",
    reflectVerdict: { ...defaultVerdict },
    renderHints: {},
    telemetry: { ...defaultTelemetry },
  };
}
