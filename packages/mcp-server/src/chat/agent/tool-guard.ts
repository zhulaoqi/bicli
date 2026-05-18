import type { Response } from "express";
import type { ToolCallRecord } from "../session-store.js";
import { emitSse } from "./agent-deps.js";

/** 写操作前常需的只读 list 工具；子 Agent 裁剪后应保留 */
export function isReadOnlyListToolName(name: string): boolean {
  if (name === "self_permissions" || name === "config_get") return true;
  return /_list$/.test(name) || name.endsWith("_archived_list");
}

const DOMAIN_NAME_FRAGMENTS: Record<string, string[]> = {
  schedule: ["schedule"],
  dashboard: ["dashboard"],
  chart: ["chart"],
  analysis: ["analysis", "funnel", "retention"],
  event: ["event"],
  table: ["table", "datasource", "dws"],
  project: ["project", "product"],
  user: ["user"],
  role: ["role"],
  view: ["view"],
  knowledge: ["knowledge", "concept"],
};

export function toolNameMatchesDomain(toolName: string, domain: string): boolean {
  const n = toolName.toLowerCase();
  const fragments = DOMAIN_NAME_FRAGMENTS[domain];
  if (!fragments) return n.includes(domain.toLowerCase());
  return fragments.some((f) => n.includes(f));
}

/**
 * 子 Agent 按前缀裁剪后，把「路由域相关的只读 list」与 Skill 声明的 requiredTools 补回，
 * 避免模型/Skill 仍调用已被裁掉的工具导致前端无限「调用中」。
 */
export function mergeToolsAfterSubAgentFilter(
  beforeFilter: string[],
  afterFilter: string[],
  domains: string[],
  requiredTools: string[] = [],
): { merged: string[]; restored: string[] } {
  const mergedSet = new Set(afterFilter);
  const restored: string[] = [];

  const tryRestore = (name: string) => {
    if (!beforeFilter.includes(name) || mergedSet.has(name)) return;
    mergedSet.add(name);
    restored.push(name);
  };

  for (const name of requiredTools) {
    tryRestore(name);
  }

  if (domains.length > 0) {
    for (const name of beforeFilter) {
      if (!isReadOnlyListToolName(name)) continue;
      if (domains.some((d) => toolNameMatchesDomain(name, d))) {
        tryRestore(name);
      }
    }
  }

  return { merged: [...mergedSet], restored };
}

export function buildToolNotAllowedPayload(toolName: string): string {
  return JSON.stringify({
    success: false,
    error: {
      code: "TOOL_NOT_ALLOWED",
      message: `工具 ${toolName} 在当前路由/子 Agent 下不可用，请改用已开放工具或调整问法`,
    },
  });
}

export function emitBlockedToolResult(
  res: Response,
  toolCallId: string,
  toolName: string,
  record: ToolCallRecord | undefined,
  durationMs: number,
): void {
  const blocked = buildToolNotAllowedPayload(toolName);
  if (record) {
    record.result = blocked;
    record.duration = durationMs;
    record.status = "error";
  }
  emitSse(res, "tool_result", {
    id: toolCallId,
    name: toolName,
    result: blocked,
    duration: durationMs,
    status: "error",
  });
}

/** Act/Repair 流结束后，仍为 running 的工具一律标错并补发 tool_result */
export function finalizeOrphanedToolCalls(
  toolCalls: ToolCallRecord[],
  res: Response,
  reason = "ORPHANED_TOOL_CALL",
): number {
  let count = 0;
  const payload = JSON.stringify({
    success: false,
    error: {
      code: reason,
      message: "工具调用未正常结束（可能被路由裁剪或执行中断），请重试或换用更具体的问法",
    },
  });

  for (const rec of toolCalls) {
    if (rec.status !== "running") continue;
    rec.status = "error";
    rec.result = payload;
    rec.duration = rec.duration ?? 0;
    emitSse(res, "tool_result", {
      id: rec.id,
      name: rec.name,
      result: payload,
      duration: rec.duration,
      status: "error",
    });
    count++;
  }
  return count;
}

const DEFAULT_TOOL_EXECUTE_TIMEOUT_MS = Number(process.env.AGENT_TOOL_TIMEOUT_MS) || 60_000;

export async function withToolExecuteTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = DEFAULT_TOOL_EXECUTE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tool execute timeout (${timeoutMs}ms): ${label}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
