import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

const SQL_BLACKLIST = /\b(DROP|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i;

/**
 * dataeye SQL 查询
 *
 * POST /api/sql-editor/execSql
 * @RequestBody SqlEditorExecParam:
 *   - script: SQL 脚本
 *   - sourceId: 数据源 ID（从 dataeye_project_list 或 /bicli/auth/datasources 获取）
 *   - scriptType: 固定 "SQL"
 *   - size: 最大返回行数
 *   - variables: 变量列表（可选）
 *
 * 调用前，AI 应先通过 dataeye_project_list 获取项目，
 * 然后通过 dataeye_dws_table 查看表结构，再生成 SQL。
 * sourceId 可从 /bicli/auth/datasources 接口获取。
 */
export async function dateyeSqlQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { sql, sourceId, limit = 100 } = cleanArgs;

    if (!sql || typeof sql !== "string") return formatError("INVALID_ARGS", "sql is required");
    if (!sourceId) return formatError("INVALID_ARGS", "sourceId is required (get from dataeye_project_list or datasources API)");

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
          sourceId: String(sourceId),
          scriptType: "SQL",
          size: Number(limit),
          variables: [],
        },
      },
    );

    return formatSuccess({
      sql: finalSql,
      result: data,
    });
  });
}

export const dateyeSqlQueryDef = {
  name: "dataeye_sql_query",
  description: "在 dataeye 数据源上执行只读 SQL 查询。需要 sourceId（从 dataeye_project_list 获取数据源信息）",
  inputSchema: {
    type: "object" as const,
    properties: {
      sql: { type: "string", description: "SELECT SQL 语句（禁止 DDL/DML）" },
      sourceId: { type: "string", description: "数据源 ID（通过 dataeye_project_list 或 datasources API 获取）" },
      limit: { type: "number", description: "最大返回行数", default: 100 },
      _context: { type: "object" },
    },
    required: ["sql", "sourceId", "_context"],
  },
};
