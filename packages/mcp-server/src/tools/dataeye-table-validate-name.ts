import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 校验数据表名是否已存在
 * POST /api/biDataSource/validateTableName (@RequestBody BiDataSourceDto)
 * 创建数据表前必须调用此接口
 */
export async function dateyeTableValidateName(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { tableName, projectId } = cleanArgs;

    if (!tableName) return formatError("INVALID_ARGS", "tableName is required");
    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");

    const data = await dateyeRequest<{ exists: boolean } | boolean>(
      "/api/biDataSource/validateTableName",
      context,
      {
        method: "POST",
        body: { tableName: String(tableName), projectId: Number(projectId) },
      }
    );

    const exists = typeof data === "boolean" ? data : (data as any).exists;
    return formatSuccess({
      tableName: String(tableName),
      available: !exists,
      message: exists ? `表名 "${tableName}" 已存在，请使用其他名称` : `表名 "${tableName}" 可用`,
    });
  });
}

export const dateyeTableValidateNameDef = {
  name: "dataeye_table_validate_name",
  description: "校验数据表名是否已存在，创建数据表前必须调用。返回表名是否可用。",
  inputSchema: {
    type: "object" as const,
    properties: {
      tableName: { type: "string", description: "要校验的表名（必填）" },
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      _context: { type: "object" },
    },
    required: ["tableName", "projectId", "_context"],
  },
};
