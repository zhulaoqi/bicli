import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建数据表（在 StarRocks 中执行 DDL）
 * POST /api/biDataSource/createTable (@RequestBody BiDataSourceDto)
 *
 * ctType:
 *   1 = DUPLICATE KEY — 日志/事件表，允许重复主键
 *   3 = PRIMARY KEY — 唯一主键，支持 UPDATE
 *
 * 调用前请先执行 dataeye_table_validate_name 确认表名不重复
 */
export async function dateyeTableCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, tableName, remark, ctType, fields } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");
    if (!tableName) return formatError("INVALID_ARGS", "tableName is required");
    if (!ctType) return formatError("INVALID_ARGS", "ctType is required: 1=DUPLICATE KEY(日志表), 3=PRIMARY KEY(主键唯一表)");
    if (!fields || !Array.isArray(fields) || (fields as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "fields is required and must contain at least one field definition");
    }

    const ctTypeNum = Number(ctType);
    if (ctTypeNum !== 1 && ctTypeNum !== 3) {
      return formatError("INVALID_ARGS", "ctType must be 1 (DUPLICATE KEY) or 3 (PRIMARY KEY)");
    }

    const body: Record<string, unknown> = {
      projectId: Number(projectId),
      tableName: String(tableName),
      ctType: ctTypeNum,
      biDataSourceStructureList: (fields as Array<Record<string, unknown>>).map((f) => ({
        fieldName: String(f.fieldName),
        identifier: String(f.identifier),
        dataType: String(f.dataType),
        primaryKey: f.primaryKey ? 1 : 0,
        remark: f.remark ? String(f.remark) : "",
      })),
    };
    if (remark) body.remark = String(remark);

    const data = await dateyeRequest("/api/biDataSource/createTable", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeTableCreateDef = {
  name: "dataeye_table_create",
  description: "单步创建数据表。上传文件或样例数据建表请优先使用 dataeye_table_import_create；本工具需要调用方已准备完整字段定义，并在对话中得到用户明确确认后再调用。",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      tableName: { type: "string", description: "表名（必填，建议先调 dataeye_table_validate_name 校验）" },
      remark: { type: "string", description: "表说明（可选）" },
      ctType: { type: "number", description: "表类型：1=DUPLICATE KEY日志表，3=PRIMARY KEY唯一表（必填）" },
      fields: {
        type: "array",
        description: "字段列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            fieldName: { type: "string", description: "字段中文名/备注" },
            identifier: { type: "string", description: "字段英文标识（StarRocks 列名）" },
            dataType: { type: "string", enum: ["1", "2", "3"], description: "数据类型：1=datetime, 2=varchar, 3=number" },
            primaryKey: { type: "boolean", description: "是否主键", default: false },
            remark: { type: "string", description: "字段备注（可选）" },
          },
          required: ["fieldName", "identifier", "dataType"],
        },
      },
      _context: { type: "object" },
    },
    required: ["projectId", "tableName", "ctType", "fields", "_context"],
  },
};
