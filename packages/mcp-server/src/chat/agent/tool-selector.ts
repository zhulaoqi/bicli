import type { RouteDecision, RouteName } from "./agent-state.js";

/** Selector 只关心这几个字段，不强依赖 ToolDef，便于在 stream.ts 直接用 StreamToolSpec。 */
export interface ToolRouteFacet {
  name: string;
  domain?: string;
  routeHints?: RouteName[];
  knowledgeOnly?: boolean;
  destructive?: boolean | string[];
  tier?: "business" | "atomic" | "internal";
}

export interface ToolSelection<T extends ToolRouteFacet = ToolRouteFacet> {
  /** 模型本轮可见的工具集合 */
  allowed: T[];
  /** 被显式屏蔽的工具名（仅做 trace） */
  forbidden: string[];
  /** 选择过程的简短说明（trace 与调试） */
  reasoning: string;
}

const DEFAULT_HINTS: RouteName[] = ["realtime_query", "diagnosis"];

/**
 * 业务级工具应优先于同领域的 atomic 写工具。
 * key=domain（粗略），value=同领域被覆盖的 atomic 工具名列表。
 * 例如：选了 dataeye_schedule_manage 后，schedule 域下所有写操作 atomic 工具都不应再让模型可见。
 */
const BUSINESS_OVERRIDES: Array<{
  business: string;
  /** 这些 atomic 工具被对应 business 工具屏蔽 */
  shadowedAtomic: string[];
}> = [
  {
    business: "dataeye_schedule_manage",
    shadowedAtomic: [
      "dataeye_schedule_create",
      "dataeye_schedule_update",
      "dataeye_schedule_delete",
      "dataeye_schedule_copy",
      "dataeye_schedule_unarchive",
    ],
  },
  {
    business: "dataeye_user_onboard",
    shadowedAtomic: ["dataeye_user_create", "dataeye_user_assign_role"],
  },
  {
    business: "dataeye_table_import_create",
    shadowedAtomic: ["dataeye_table_create"],
  },
  {
    business: "dataeye_dashboard_execute",
    shadowedAtomic: [],
  },
];

function getHints(tool: ToolRouteFacet): RouteName[] {
  return tool.routeHints && tool.routeHints.length > 0 ? tool.routeHints : DEFAULT_HINTS;
}

function isToolDestructive(tool: ToolRouteFacet): boolean {
  if (tool.destructive === true) return true;
  if (Array.isArray(tool.destructive) && tool.destructive.length > 0) return true;
  return false;
}

function isPureKnowledgeTool(tool: ToolRouteFacet): boolean {
  return tool.knowledgeOnly === true;
}

function matchesAnyDomain(tool: ToolRouteFacet, domains: string[]): boolean {
  if (domains.length === 0) return true;
  for (const d of domains) {
    if (tool.name.toLowerCase().includes(d.toLowerCase())) return true;
    if (tool.domain && tool.domain.toLowerCase() === d.toLowerCase()) return true;
  }
  return false;
}

export function selectToolsForRoute<T extends ToolRouteFacet>(
  registry: T[],
  decision: RouteDecision,
): ToolSelection<T> {
  const allowed: T[] = [];
  const forbidden: string[] = [];
  const route = decision.route;

  for (const tool of registry) {
    const hints = getHints(tool);

    // 1. knowledge / visual_explain 路由：只允许 knowledgeOnly=true 工具
    if (route === "knowledge" || route === "visual_explain") {
      if (isPureKnowledgeTool(tool)) {
        allowed.push(tool);
      } else {
        forbidden.push(tool.name);
      }
      continue;
    }

    // 2. 非 knowledge 路由不要把纯知识工具暴露
    if (isPureKnowledgeTool(tool)) {
      forbidden.push(tool.name);
      continue;
    }

    // 3. 工具的 routeHints 必须包含当前 route
    if (!hints.includes(route)) {
      forbidden.push(tool.name);
      continue;
    }

    // 4. write_action 路由：屏蔽被 business 工具覆盖的 atomic 写工具
    if (route === "write_action") {
      const shadowed = isShadowedAtomicForBusiness(tool, registry);
      if (shadowed) {
        forbidden.push(tool.name);
        continue;
      }
    }

    // 5. 其他路由（realtime_query / diagnosis）：destructive 工具不可见
    if (route !== "write_action" && isToolDestructive(tool)) {
      forbidden.push(tool.name);
      continue;
    }

    allowed.push(tool);
  }

  // 6. domain 过滤：在多于 N 个候选时，把工具按 domain 命中度重新排序，但不剔除（避免误伤跨域查询）
  if (decision.domains.length > 0 && allowed.length > 8) {
    allowed.sort((a, b) => {
      const aMatch = matchesAnyDomain(a, decision.domains) ? 1 : 0;
      const bMatch = matchesAnyDomain(b, decision.domains) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  return {
    allowed,
    forbidden,
    reasoning:
      `route=${route}; domains=${decision.domains.join(",") || "-"}; ` +
      `allowed=${allowed.length}, forbidden=${forbidden.length}`,
  };
}

function isShadowedAtomicForBusiness(tool: ToolRouteFacet, registry: ToolRouteFacet[]): boolean {
  for (const rule of BUSINESS_OVERRIDES) {
    if (!rule.shadowedAtomic.includes(tool.name)) continue;
    const businessExists = registry.some((t) => t.name === rule.business);
    if (businessExists) return true;
  }
  return false;
}
