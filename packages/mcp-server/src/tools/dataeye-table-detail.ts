import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 数据表详情 — 获取表元数据 + 字段结构
 */
export async function dateyeTableDetail(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { tableId, projectId, tableName } = cleanArgs;

    if (tableId) {
      const data = await dateyeRequest<{
        id: number;
        tableName: string;
        remark: string;
        projectId: string;
        orgId: string;
        status: number;
        ctType: number;
        biDataSourceStructureList: Array<{
          id: number;
          identifier: string;
          fieldName: string;
          dataType: number;
          remark: string;
          position: number;
          primaryKey: string;
        }>;
      }>("/api/biDataSource/getByBiDataSource", context, {
        params: { id: Number(tableId) },
      });
      return formatSuccess(data);
    }

    if (projectId && tableName) {
      const data = await dateyeRequest("/api/biDwsTable/getTableInfo", context, {
        params: {
          projectId: Number(projectId),
          tableName: String(tableName),
        },
      });
      return formatSuccess(data);
    }

    return formatError("INVALID_ARGS", "Provide tableId (bi_data_source) or projectId+tableName (DWS)");
  });
}

export const dateyeTableDetailDef = {
  name: "dataeye_table_detail",
  description: "获取 dataeye 数据表的详情和字段结构，支持按 ID 或表名查询",
  inputSchema: {
    type: "object" as const,
    properties: {
      tableId: { type: "number", description: "bi_data_source.id" },
      projectId: { type: "number", description: "项目 ID（与 tableName 配合查 DWS 表信息）" },
      tableName: { type: "string", description: "物理表名" },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
