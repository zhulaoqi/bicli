import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye DWS 表列表 — 查询 StarRocks 中的物理表和字段结构
 * 这是 AI 问数的关键：知道有哪些表和字段，才能自动生成 SQL
 */
export async function dateyeDwsTable(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, tableName } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");

    if (tableName) {
      const data = await dateyeRequest("/api/biDwsTable/getTableInfo", context, {
        params: { projectId: Number(projectId), tableName: String(tableName) },
      });
      return formatSuccess(data);
    }

    const data = await dateyeRequest<Array<{
      tableName: string;
      tableComment?: string;
    }>>("/api/biDwsTable/listDwsTable", context, {
      params: { projectId: Number(projectId) },
    });

    return formatSuccess(data);
  });
}

export const dateyeDwsTableDef = {
  name: "dataeye_dws_table",
  description: "查询 dataeye 项目下的 StarRocks 物理表列表及表结构，用于 AI 问数前了解可用数据",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "项目 ID（必填）" },
      tableName: { type: "string", description: "指定表名查看字段结构" },
      _context: { type: "object" },
    },
    required: ["projectId", "_context"],
  },
};
