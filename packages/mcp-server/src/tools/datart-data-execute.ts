import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

type Dataframe = {
  columns?: Array<{ name: string; type?: string }>;
  rows?: unknown[][];
  pageInfo?: { total?: number };
};

function summarizeDataframe(df: Dataframe, title: string) {
  const cols = (df.columns ?? []).map((c) => c.name);
  const rows = df.rows ?? [];
  const total = df.pageInfo?.total ?? rows.length;

  // 检测是否有图表型数据（时间列+数值列）
  const hasDateCol = cols.some((c) => /date|time|day|month|week/i.test(c));
  const numCols = cols.filter((c) => !/date|time|day|month|week|name|label|key/i.test(c));

  return {
    title,
    columns: cols,
    totalRows: total,
    preview: rows.slice(0, 5),
    hasChart: hasDateCol && numCols.length > 0,
    chartHint: hasDateCol ? { xField: cols.find((c) => /date|time|day|month|week/i.test(c)), yFields: numCols.slice(0, 3) } : undefined,
  };
}

export async function datartDataExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { viewId, vizId, vizType = "DATACHART", pageSize = 100 } = cleanArgs;
    if (!viewId) return formatError("INVALID_ARGS", "viewId is required");

    const body: Record<string, unknown> = {
      viewId,
      vizType,
      pageInfo: { pageNo: 1, pageSize },
      columns: [],
      aggregators: [],
      groups: [],
      filters: [],
      orders: [],
    };
    if (vizId) body.vizId = vizId;

    const df = await datartRequest<Dataframe>("/api/v1/data-provider/execute", context, {
      method: "POST",
      body,
    });

    if (!df) return formatError("EMPTY", "图表数据为空");

    const summary = summarizeDataframe(df, String(cleanArgs.chartName || vizId || "图表数据"));
    return formatSuccess(summary);
  });
}

export const datartDataExecuteDef = {
  name: "dataeye_chart_data_execute",
  description: "执行 DataEye 数据视图或高级图表的数据查询，返回结果摘要（前5行 + 列信息）",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string", description: "数据视图 ID，从看板详情或数据视图列表工具获取" },
      vizId: { type: "string", description: "图表 ID（可选）" },
      vizType: { type: "string", description: "DATACHART 或 DASHBOARD", default: "DATACHART" },
      chartName: { type: "string", description: "图表名称（用于显示，可选）" },
      pageSize: { type: "number", description: "最多返回行数，默认 100", default: 100 },
    },
    required: ["viewId"],
  },
};
