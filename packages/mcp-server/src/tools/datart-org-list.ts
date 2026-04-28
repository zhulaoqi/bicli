import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

type VisualizationOrg = { id: string; name: string; avatar?: string };

/**
 * 获取当前用户在可视化资产服务中的组织列表。
 */
export async function datartOrgList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, _args, context) => {
    const orgs = await datartRequest<VisualizationOrg[]>("/api/v1/orgs", context);
    if (!orgs?.length) return formatError("NOT_FOUND", "未找到任何可用组织，请确认登录状态");
    return formatSuccess({
      total: orgs.length,
      orgs: orgs.map((o) => ({ id: o.id, name: o.name })),
      hint: "如需指定组织，请使用上面的 orgId",
    });
  });
}

export const datartOrgListDef = {
  name: "dataeye_visualization_org_list",
  description: "获取当前用户可访问的可视化资产组织列表",
  inputSchema: { type: "object", properties: {} },
};

/** 工具函数：自动获取第一个可视化资产组织的 orgId */
export async function resolveDatartOrgId(context: import("../types/index.js").ToolContext): Promise<string> {
  // 1. 优先使用 env 中配置的固定 orgId
  const envOrgId = process.env.DATART_ORG_ID?.trim();
  if (envOrgId) return envOrgId;

  // 2. 自动调 /api/v1/orgs 取第一个
  const orgs = await datartRequest<VisualizationOrg[]>("/api/v1/orgs", context);
  if (!orgs?.length) throw new Error("未找到任何可用组织，请确认登录状态或检查可视化服务配置");
  return orgs[0].id;
}
