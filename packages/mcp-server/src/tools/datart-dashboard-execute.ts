import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import { buildChartDataRequestBody, parseRecord, summarizeDataframe } from "./datart-data-execute.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

type Dataframe = {
  columns?: Array<{ name: string; type?: string }>;
  rows?: unknown[][];
  pageInfo?: { total?: number };
};

type DatachartItem = {
  id: string;
  name?: string;
  viewId?: string;
  view_id?: string;
  config?: unknown;
};

type ViewItem = {
  id: string;
  name?: string;
  sourceId?: string;
  config?: unknown;
};

type DashboardDetail = {
  id: string;
  name?: string;
  datacharts?: DatachartItem[];
  views?: ViewItem[];
};

export async function datartDashboardExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const dashboardId = cleanArgs.dashboardId;
    if (!dashboardId) return formatError("INVALID_ARGS", "dashboardId is required");

    const pageSize = Number(cleanArgs.pageSize ?? 100);
    const maxCharts = Math.max(1, Math.min(Number(cleanArgs.maxCharts ?? 20), 50));
    const detail = await datartRequest<DashboardDetail>(`/api/v1/viz/dashboards/${dashboardId}`, context);

    if (!detail) return formatError("NOT_FOUND", `看板 ${dashboardId} 不存在或无权访问`);

    const charts = resolveExecutableCharts(detail).slice(0, maxCharts);
    if (!charts.length) {
      return formatError(
        "NO_EXECUTABLE_CHARTS",
        "看板中没有找到可执行图表。请先确认看板详情返回了图表 ID 和关联的数据视图 ID",
      );
    }

    const results = [];
    for (const chart of charts) {
      try {
        const body = buildChartDataRequestBody({
          viewId: chart.viewId,
          vizId: chart.id,
          vizType: "DATACHART",
          pageSize,
          config: chart.config,
          view: chart.view,
        });
        const df = await datartRequest<Dataframe>("/api/v1/data-provider/execute", context, {
          method: "POST",
          body,
        });

        results.push({
          success: true,
          chartId: chart.id,
          chartName: chart.name,
          viewId: chart.viewId,
          summary: summarizeDataframe(df ?? {}, chart.name || chart.id),
        });
      } catch (error) {
        results.push({
          success: false,
          chartId: chart.id,
          chartName: chart.name,
          viewId: chart.viewId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    return formatSuccess({
      success: successCount > 0,
      dashboardId: detail.id,
      dashboardName: detail.name,
      chartCount: detail.datacharts?.length ?? 0,
      executedCount: results.length,
      successCount,
      failedCount: results.length - successCount,
      results,
      message:
        results.length < (detail.datacharts?.length ?? 0)
          ? `已执行前 ${results.length} 个可执行图表，可通过 maxCharts 调整上限`
          : "已按图表逐个执行看板查询",
    });
  });
}

export function resolveExecutableCharts(detail: DashboardDetail): Array<{
  id: string;
  name?: string;
  viewId: string;
  config?: unknown;
  view?: ViewItem;
}> {
  const views = new Map((detail.views ?? []).map((view) => [view.id, view]));
  return (detail.datacharts ?? [])
    .map((chart) => {
      const config = parseRecord(chart.config);
      const viewId = chart.viewId || chart.view_id || stringValue(config.viewId) || stringValue(config.view_id);
      if (!chart.id || !viewId) return null;
      return {
        id: chart.id,
        name: chart.name,
        viewId,
        config: chart.config,
        view: views.get(viewId),
      };
    })
    .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const datartDashboardExecuteDef = {
  name: "dataeye_dashboard_execute",
  description: "执行 DataEye 数据看板查询：先读取看板详情，再逐个执行看板中的高级图表并汇总结果",
  inputSchema: {
    type: "object",
    properties: {
      dashboardId: { type: "string", description: "数据看板 ID，从 dataeye_dashboard_list 或 dataeye_dashboard_detail 获取" },
      pageSize: { type: "number", description: "每个图表最多返回行数，默认 100", default: 100 },
      maxCharts: { type: "number", description: "最多执行图表数量，默认 20，最大 50", default: 20 },
    },
    required: ["dashboardId"],
  },
};
