import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartDataTestExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { sourceId, script, size = 50 } = cleanArgs;
    if (!sourceId) return formatError("INVALID_ARGS", "sourceId is required — 先获取数据源列表");
    if (!script) return formatError("INVALID_ARGS", "script (SQL) is required");

    type Dataframe = {
      columns?: Array<{ name: string; type?: string }>;
      rows?: unknown[][];
      pageInfo?: { total?: number };
    };

    const df = await datartRequest<Dataframe>("/api/v1/data-provider/execute/test", context, {
      method: "POST",
      body: {
        sourceId,
        script,
        scriptType: "SQL",
        size,
      },
    });

    if (!df) return formatError("EMPTY", "SQL 执行无结果");

    const cols = (df.columns ?? []).map((c) => `${c.name}(${c.type ?? "?"})`);
    const rows = df.rows ?? [];
    const total = df.pageInfo?.total ?? rows.length;

    return formatSuccess({
      success: true,
      columns: cols,
      totalRows: total,
      preview: rows.slice(0, 10),
      message: `SQL 执行成功，共 ${total} 行，返回前 ${Math.min(10, rows.length)} 行`,
    });
  });
}

export const datartDataTestExecuteDef = {
  name: "dataeye_view_sql_test",
  description: "测试执行一条数据视图 SQL，返回结果预览（前10行）。用于创建数据视图前验证 SQL 正确性",
  inputSchema: {
    type: "object",
    properties: {
      sourceId: { type: "string", description: "数据源 ID，从数据源列表工具获取" },
      script: { type: "string", description: "SQL 查询语句（仅支持 SELECT）" },
      size: { type: "number", description: "最多返回行数，默认 50", default: 50 },
    },
    required: ["sourceId", "script"],
  },
};
