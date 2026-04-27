import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

type DatartOrg = { id: string; name: string; avatar?: string };

/**
 * 获取当前用户在 Datart 中的组织列表（Datart 的 orgId 与 DataEye 不同）
 */
export async function datartOrgList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, _args, context) => {
    const orgs = await datartRequest<DatartOrg[]>("/api/v1/orgs", context);
    if (!orgs?.length) return formatError("NOT_FOUND", "未找到任何 Datart 组织，请确认登录状态");
    return formatSuccess({
      total: orgs.length,
      orgs: orgs.map((o) => ({ id: o.id, name: o.name })),
      hint: "调用 datart_dashboard_list 时请传入上面的 orgId（而非 DataEye 的 orgId）",
    });
  });
}

export const datartOrgListDef = {
  name: "datart_org_list",
  description: "获取当前用户在 Datart 中的组织列表（Datart orgId 与 DataEye orgId 不同，查看板前需要先获取 Datart orgId）",
  inputSchema: { type: "object", properties: {} },
};

/** 工具函数：自动获取 Datart 第一个组织的 orgId */
export async function resolveDatartOrgId(context: import("../types/index.js").ToolContext): Promise<string> {
  // 1. 优先使用 env 中配置的固定 orgId
  const envOrgId = process.env.DATART_ORG_ID?.trim();
  if (envOrgId) return envOrgId;

  // 2. 自动调 /api/v1/orgs 取第一个
  const orgs = await datartRequest<DatartOrg[]>("/api/v1/orgs", context);
  if (!orgs?.length) throw new Error("未找到 Datart 组织，请确认登录状态或在 .env 配置 DATART_ORG_ID");
  return orgs[0].id;
}
