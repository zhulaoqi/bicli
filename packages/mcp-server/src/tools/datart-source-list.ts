import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartSourceList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const orgId = (cleanArgs.orgId as string) || context.orgId;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");

    type Source = { id: string; name: string; type: string; orgId: string };
    const sources = await datartRequest<Source[]>("/api/v1/sources", context, {
      params: { orgId },
    });

    if (!sources?.length) return formatSuccess({ total: 0, sources: [], message: "暂无数据源" });

    return formatSuccess({
      total: sources.length,
      sources: sources.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    });
  });
}

export const datartSourceListDef = {
  name: "datart_source_list",
  description: "获取 Datart 组织下的数据源列表，用于创建视图时选择 sourceId",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID" },
    },
  },
};
