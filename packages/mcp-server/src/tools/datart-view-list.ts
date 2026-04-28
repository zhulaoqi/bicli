import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartViewList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const orgId = (cleanArgs.orgId as string) || context.orgId;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");

    type View = { id: string; name: string; description?: string; sourceId?: string; isFolder?: boolean; status?: number };
    const views = await datartRequest<View[]>("/api/v1/views", context, {
      params: { orgId },
    });

    const activeViews = (views || []).filter((v) => !v.isFolder && v.status !== 0);
    return formatSuccess({
      total: activeViews.length,
      views: activeViews.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        sourceId: v.sourceId,
      })),
    });
  });
}

export const datartViewListDef = {
  name: "dataeye_view_list",
  description: "获取 DataEye 数据视图列表（SQL 视图），用于查询或创建高级图表前选择数据口径",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID" },
    },
  },
};
