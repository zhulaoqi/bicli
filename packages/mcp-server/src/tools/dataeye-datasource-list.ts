import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 数据源列表
 * GET /api/bicli/auth/datasources
 *
 * 返回当前用户所在组织的可用数据源（sourceId 供 SQL 查询使用）
 */
export async function dateyeDatasourceList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const keyword = String(cleanArgs.keyword ?? "").trim().toLowerCase();
    const data = await dateyeRequest<Array<{
      sourceId: string;
      sourceName: string;
      orgId: string;
      dsType: string;
      dbType: string;
      status: number;
    }>>("/api/bicli/auth/datasources", context);

    const list = keyword
      ? (data ?? []).filter((d) =>
          [d.sourceId, d.sourceName, d.dsType, d.dbType].some((v) => String(v ?? "").toLowerCase().includes(keyword))
        )
      : data;

    return formatSuccess(list);
  });
}

export const dateyeDatasourceListDef = {
  name: "dataeye_datasource_list",
  description: "获取当前组织的可用数据源列表，返回 sourceId 供 SQL 查询使用",
  inputSchema: {
    type: "object" as const,
    properties: {
      keyword: { type: "string", description: "本地模糊搜索关键词（数据源名称/ID/类型）" },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
