import type { AgentRunState, RouteDecision } from "../agent-state.js";
import { mergeToolsAfterSubAgentFilter } from "../tool-guard.js";
import { scheduleRunner } from "./schedule-runner.js";
import { analysisRunner } from "./analysis-runner.js";
import { userRunner } from "./user-runner.js";

/**
 * SubAgent：领域专项 agent。
 *
 * 当 router 识别到特定领域时，dispatch 到对应 sub-agent，给 system prompt 追加领域专项段，
 * 并按 toolFilter 进一步裁剪工具集合。
 *
 * 不替换主 runner，仅在 act 之前作为"装饰"层修改 deps.systemPrompt 与 state.allowedToolNames，
 * 保证 act/finalize/reflect 仍然走同一套核心循环。
 */
export interface SubAgent {
  /** 唯一名称，用于 trace */
  name: string;
  /** 命中域：route.domains 中含任一即视为 applies */
  domains: string[];
  /** 追加在 system prompt 后的专项段 */
  systemPromptSuffix: string;
  /** 留下哪些工具：返回 true 保留，false 屏蔽 */
  toolFilter: (toolName: string) => boolean;
}

export function pickSubAgent(decision: RouteDecision, registry: SubAgent[] = defaultRegistry()): SubAgent | null {
  // knowledge / visual_explain 路由专注知识工具，不进 sub-agent
  if (decision.route === "knowledge" || decision.route === "visual_explain") {
    return null;
  }

  const domains = decision.domains;
  const byName = (name: string) => registry.find((a) => a.name === name) ?? null;

  // 项目/图表/分析类问题优先 analysis，避免「有权限」误命中 role 后 user 子 Agent 裁掉 dataeye_project_list
  if (domains.some((d) => ["project", "chart", "analysis", "event", "table", "view", "dashboard"].includes(d))) {
    return byName("analysis");
  }
  if (domains.includes("schedule")) {
    return byName("schedule");
  }
  if (domains.some((d) => ["user", "role"].includes(d))) {
    return byName("user");
  }

  for (const agent of registry) {
    for (const domain of agent.domains) {
      if (domains.includes(domain)) return agent;
    }
  }
  return null;
}

export interface ApplyResult {
  systemPrompt: string;
  appliedAgent: string | null;
}

/**
 * 把 sub-agent 应用到 state 与 base system prompt 上。
 * - 修改 state.allowedToolNames（原地裁剪）
 * - 返回新的 systemPrompt（追加 suffix）
 *
 * 即使 sub-agent.toolFilter 不删除任何工具也不会出错。
 */
export function applySubAgent(agent: SubAgent, state: AgentRunState, basePrompt: string): ApplyResult {
  const beforeFilter = [...state.allowedToolNames];
  const filtered = beforeFilter.filter((n) => agent.toolFilter(n));
  const { merged, restored } = mergeToolsAfterSubAgentFilter(
    beforeFilter,
    filtered,
    state.route.domains,
    state.preferredToolNames,
  );
  state.allowedToolNames = merged;
  if (restored.length > 0) {
    console.log(`[sub-agent] ${agent.name} restored sticky tools: ${restored.join(", ")}`);
  }
  const trimmed = (agent.systemPromptSuffix || "").trim();
  const systemPrompt = trimmed.length > 0 ? `${basePrompt}\n\n${trimmed}` : basePrompt;
  return { systemPrompt, appliedAgent: agent.name };
}

function defaultRegistry(): SubAgent[] {
  return [scheduleRunner, analysisRunner, userRunner];
}
