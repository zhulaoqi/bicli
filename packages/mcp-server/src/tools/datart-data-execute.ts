import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import { createBlocksFromProfile } from "../chat/result-block-factory.js";
import { profileDataframe } from "../chat/result-profile.js";
import {
  buildChartDataRequestBody as buildSharedChartDataRequestBody,
  buildChartExecuteRequest,
  buildViewExecuteRequest,
} from "./datart-execute-request-builder.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

type Dataframe = {
  columns?: Array<{ name: string; type?: string }>;
  rows?: unknown[][];
  pageInfo?: { total?: number };
};

type ChartDataSectionField = {
  colName?: string;
  aggregate?: string;
  type?: string;
  category?: string;
  filter?: {
    condition?: {
      operator?: string;
      value?: unknown;
    };
  };
};

type ChartDataSection = {
  type?: string;
  rows?: ChartDataSectionField[];
};

export type ChartExecutionInput = {
  viewId?: unknown;
  vizId?: unknown;
  vizType?: unknown;
  pageSize?: unknown;
  config?: unknown;
  view?: unknown;
  requestBody?: unknown;
};

export function summarizeDataframe(df: Dataframe, title: string) {
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
    const { viewId, vizId, vizType = "DATACHART" } = cleanArgs;
    if (!viewId) return formatError("INVALID_ARGS", "viewId is required");
    if (vizType === "DASHBOARD") {
      return formatError(
        "INVALID_ARGS",
        "看板不能作为单个图表直接执行；请先调用 dataeye_dashboard_execute，由系统自动执行看板内多个图表",
      );
    }

    const built = vizType === "VIEW"
      ? buildViewExecuteRequest({
          viewId,
          viewName: cleanArgs.viewName || cleanArgs.chartName,
          pageSize: cleanArgs.pageSize,
          view: cleanArgs.view,
          params: cleanArgs.params,
        })
      : buildChartExecuteRequest(cleanArgs);
    if (!built.ok) return formatError(built.code, built.message);
    const body = built.request;

    const df = await datartRequest<Dataframe>("/api/v1/data-provider/execute", context, {
      method: "POST",
      body,
    });

    if (!df) return formatError("EMPTY", "图表数据为空");

    const title = String(cleanArgs.chartName || cleanArgs.viewName || viewNameFromInput(cleanArgs.view) || vizId || "图表数据");
    const summary = summarizeDataframe(df, title);
    return formatSuccess({
      ...summary,
      displayHint: "structured_blocks",
      __blocks__: createBlocksFromProfile(profileDataframe(df), {
        title,
        sourceTool: "dataeye_data_execute",
        maxRows: 20,
      }),
    });
  });
}

function viewNameFromInput(view: unknown): string | undefined {
  if (!view || typeof view !== "object") return undefined;
  const name = (view as Record<string, unknown>).name;
  return typeof name === "string" ? name : undefined;
}

export function buildChartDataRequestBody(input: ChartExecutionInput): Record<string, unknown> {
  return buildSharedChartDataRequestBody(input);
}

function buildAggregators(datas: ChartDataSection[], aggregation: boolean): Array<Record<string, unknown>> {
  if (!aggregation) return [];
  return uniqueByColumn(
    datas
      .flatMap((section) => {
        if (["aggregate", "size", "info"].includes(String(section.type))) {
          return section.rows ?? [];
        }
        if (section.type === "mixed") {
          return (section.rows ?? []).filter((row) => row.type === "NUMERIC");
        }
        return [];
      })
      .filter((row) => row.colName)
      .map((row) => ({
        alias: buildAlias(row),
        column: [row.colName],
        sqlOperator: row.aggregate,
      })),
  );
}

function buildGroups(datas: ChartDataSection[], aggregation: boolean): Array<Record<string, unknown>> {
  if (!aggregation) return [];
  return uniqueByColumn(
    datas
      .flatMap((section) => {
        if (["group", "color"].includes(String(section.type))) {
          return section.rows ?? [];
        }
        if (section.type === "mixed") {
          return (section.rows ?? []).filter((row) => ["DATE", "STRING"].includes(String(row.type)));
        }
        return [];
      })
      .filter((row) => row.colName)
      .map((row) => ({
        alias: buildAlias(row),
        column: [row.colName],
      })),
  );
}

function buildColumns(datas: ChartDataSection[], aggregation: boolean): Array<Record<string, unknown>> {
  if (aggregation) return [];
  return uniqueByColumn(
    datas
      .flatMap((section) => {
        if (["color", "aggregate", "size", "info", "mixed", "group"].includes(String(section.type))) {
          return section.rows ?? [];
        }
        return [];
      })
      .filter((row) => row.colName && row.category !== "aggregateComputedField")
      .map((row) => ({
        alias: buildAlias(row),
        column: [row.colName],
      })),
  );
}

function buildFilters(datas: ChartDataSection[]): Array<Record<string, unknown>> {
  return datas
    .filter((section) => section.type === "filter")
    .flatMap((section) => section.rows ?? [])
    .filter((row) => row.colName && row.filter?.condition?.operator)
    .map((row) => ({
      column: [row.colName],
      sqlOperator: row.filter?.condition?.operator,
      values: row.filter?.condition?.value,
    }));
}

function buildAlias(row: ChartDataSectionField): string {
  if (!row.aggregate || row.aggregate === "NONE") return String(row.colName);
  return `${row.aggregate}(${row.colName})`;
}

function uniqueByColumn(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify([item.column, item.sqlOperator]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const datartDataExecuteDef = {
  name: "dataeye_chart_data_execute",
  description: "执行 DataEye 单个图表或直接视图的数据查询，返回结果摘要（前5行 + 列信息）。执行完整可视化资源请优先使用 dataeye_dashboard_execute；不要把看板类资源、folderId 或用户给出的名称直接传给本工具",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string", description: "数据视图 ID，从看板详情或数据视图列表工具获取" },
      vizId: { type: "string", description: "图表 ID（可选）" },
      vizType: { type: "string", description: "仅支持 DATACHART；数据看板请调用 dataeye_dashboard_execute", default: "DATACHART" },
      chartName: { type: "string", description: "图表名称（用于显示，可选）" },
      pageSize: { type: "number", description: "最多返回行数，默认 100", default: 100 },
      config: { type: "object", description: "图表保存配置（可选，通常由看板执行工具内部传入）" },
      view: { type: "object", description: "数据视图配置（可选，通常由看板执行工具内部传入）" },
      requestBody: { type: "object", description: "已构造好的数据查询请求体（可选）" },
    },
    required: ["viewId"],
  },
};
