import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import { resolveSqlSourceId } from "./sql-source-id.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

const SQL_BLACKLIST = /\b(DROP|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i;

/**
 * dataeye SQL 查询
 *
 * POST /api/sql-editor/execSql
 * @RequestBody SqlEditorExecParam:
 *   - script: SQL 脚本
 *   - sourceId: 数据源 ID（**纯数字**，仅来自 dataeye_datasource_list）
 *   - scriptType: 固定 "SQL"
 *   - size: 最大返回行数
 *
 * 调用前必须先 dataeye_datasource_list 获取 sourceId。
 * DAU/事件类指标优先 dataeye_event_analysis，勿臆造 event_log 表名。
 */
export async function dateyeSqlQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { sql, sourceId, limit = 100 } = cleanArgs;

    if (!sql || typeof sql !== "string") return formatError("INVALID_ARGS", "sql is required");
    if (!sourceId) {
      return formatError(
        "INVALID_ARGS",
        "sourceId is required — 先调用 dataeye_datasource_list 获取纯数字 sourceId",
      );
    }

    const resolved = await resolveSqlSourceId(sourceId, context);
    if (!resolved.ok) {
      return formatError("INVALID_SOURCE_ID", resolved.message);
    }

    const trimmed = sql.trim();
    if (SQL_BLACKLIST.test(trimmed)) {
      return formatError("SQL_FORBIDDEN", "Only SELECT queries are allowed");
    }

    const safeSql = trimmed.replace(/;\s*$/, "");
    const hasLimit = /\bLIMIT\s+\d+/i.test(safeSql);
    const finalSql = hasLimit ? safeSql : `${safeSql} LIMIT ${Number(limit)}`;

    const data = await dateyeRequest<Record<string, unknown>>(
      "/api/sql-editor/execSql",
      context,
      {
        body: {
          script: finalSql,
          sourceId: resolved.sourceId,
          scriptType: "SQL",
          size: Number(limit),
          variables: [],
        },
      },
    );

    return formatSuccess({
      sql: finalSql,
      sourceId: resolved.sourceId,
      ...(resolved.autoResolved ? { autoResolvedSourceId: true, hint: resolved.hint } : {}),
      result: data,
    });
  });
}

export const dateyeSqlQueryDef = {
  name: "dataeye_sql_query",
  description:
    "在 DataEye SQL Editor 数据源上执行只读 SELECT。sourceId 必须是 dataeye_datasource_list 返回的纯数字 sourceId；" +
    "禁止使用视图 id、项目 uuid、dataeye_project_list 的 id、dataeye_data_source_list 的 Datart uuid。" +
    "查 DAU/事件指标请优先 dataeye_event_analysis。",
  inputSchema: {
    type: "object" as const,
    properties: {
      sql: { type: "string", description: "SELECT SQL 语句（禁止 DDL/DML）" },
      sourceId: {
        type: "string",
        description:
          "纯数字数据源 ID（仅来自 dataeye_datasource_list.sourceId）。禁止传入 32 位 UUID/视图 id",
      },
      limit: { type: "number", description: "最大返回行数", default: 100 },
      _context: { type: "object" },
    },
    required: ["sql", "sourceId", "_context"],
  },
};
