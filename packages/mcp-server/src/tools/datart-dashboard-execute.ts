import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import { summarizeDataframe } from "./datart-data-execute.js";
import { createBlocksFromProfile, createSummaryBlock } from "../chat/result-block-factory.js";
import { profileDataframe, profileDiagnostics } from "../chat/result-profile.js";
import {
  buildChartExecuteRequest,
  buildViewExecuteRequest,
  parseRecord,
} from "./datart-execute-request-builder.js";
import { resolveDashboardRef } from "./datart-resource-resolver.js";
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
  meta?: unknown;
  model?: unknown;
  computedFields?: unknown;
};

type WidgetItem = {
  id: string;
  name?: string;
  datachartId?: string;
  datachart_id?: string;
  viewIds?: string[];
  view_ids?: string[];
};

type DashboardDetail = {
  id: string;
  name?: string;
  widgets?: WidgetItem[];
  datacharts?: DatachartItem[];
  views?: ViewItem[];
};

type DashboardExecutableUnit = {
  unitId: string;
  unitType: "chart" | "view";
  widgetId?: string;
  widgetName?: string;
  chartId?: string;
  chartName?: string;
  viewId: string;
  viewName?: string;
  chartConfig?: unknown;
  view?: ViewItem;
};

type SkippedUnit = {
  unitId?: string;
  widgetId?: string;
  reason: string;
};

export async function datartDashboardExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    if (!cleanArgs.dashboardId && !cleanArgs.dashboardName && !cleanArgs.dashboardRef) {
      return formatError("INVALID_ARGS", "dashboardId, dashboardName or dashboardRef is required");
    }

    const pageSize = Number(cleanArgs.pageSize ?? 100);
    const maxUnits = Math.max(1, Math.min(Number(cleanArgs.maxUnits ?? cleanArgs.maxCharts ?? 20), 50));
    const includeCharts = cleanArgs.includeCharts !== false;
    const includeViews = cleanArgs.includeViews !== false;
    const resolved = await resolveDashboardRef(context, cleanArgs);

    if (!resolved.resolved) {
      return formatError(resolved.code, resolved.message);
    }

    const detail = await datartRequest<DashboardDetail>(`/api/v1/viz/dashboards/${resolved.resource.id}`, context);

    if (!detail) return formatError("NOT_FOUND", `看板 ${resolved.resource.id} 不存在或无权访问`);

    const plan = resolveDashboardExecutableUnits(detail, { includeCharts, includeViews });
    const units = plan.units.slice(0, maxUnits);
    if (!units.length) {
      return formatError(
        "NO_EXECUTABLE_UNITS",
        "看板中没有找到可执行图表或视图。请先确认看板详情返回了 widgets、图表 ID 和关联的数据视图 ID",
      );
    }

    const results = [];
    const blocks = [];
    const skippedUnits = [...plan.skippedUnits];
    for (const unit of units) {
      try {
        const built = unit.unitType === "chart"
          ? buildChartExecuteRequest({
              viewId: unit.viewId,
              vizId: unit.chartId,
              vizName: unit.chartName,
              vizType: "DATACHART",
              pageSize,
              config: unit.chartConfig,
              view: unit.view,
            })
          : buildViewExecuteRequest({
              viewId: unit.viewId,
              viewName: unit.viewName,
              pageSize,
              view: unit.view,
            });
        if (!built.ok) {
          skippedUnits.push({ unitId: unit.unitId, widgetId: unit.widgetId, reason: built.message });
          continue;
        }
        const df = await datartRequest<Dataframe>("/api/v1/data-provider/execute", context, {
          method: "POST",
          body: built.request,
        });
        blocks.push(...createBlocksFromProfile(profileDataframe(df ?? {}), {
          title: unit.chartName || unit.viewName || unit.widgetName || unit.unitId,
          sourceTool: "dataeye_dashboard_execute",
          maxRows: 20,
        }));

        results.push({
          success: true,
          unitId: unit.unitId,
          unitType: unit.unitType,
          widgetId: unit.widgetId,
          widgetName: unit.widgetName,
          chartId: unit.chartId,
          chartName: unit.chartName,
          viewId: unit.viewId,
          viewName: unit.viewName,
          summary: summarizeDataframe(df ?? {}, unit.chartName || unit.viewName || unit.unitId),
        });
      } catch (error) {
        results.push({
          success: false,
          unitId: unit.unitId,
          unitType: unit.unitType,
          widgetId: unit.widgetId,
          widgetName: unit.widgetName,
          chartId: unit.chartId,
          chartName: unit.chartName,
          viewId: unit.viewId,
          viewName: unit.viewName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    const failedCount = results.length - successCount;
    const failedResults = results
      .filter((item) => !item.success)
      .map((item) => ({
        unitId: item.unitId,
        chartName: item.chartName,
        viewName: item.viewName,
        error: item.error,
      }));
    if (successCount === 0) {
      return formatError(
        "EXECUTION_FAILED",
        skippedUnits.length > 0
          ? `看板组件未成功执行。已跳过 ${skippedUnits.length} 个组件：${skippedUnits.map((item) => item.reason).join("；")}`
          : "看板组件执行失败，未获得任何成功结果",
      );
    }
    return formatSuccess({
      success: successCount > 0,
      resolvedResource: {
        id: resolved.resource.id,
        name: resolved.resource.name,
        folderId: resolved.resource.folderId,
        matchedBy: resolved.matchedBy,
      },
      dashboardId: detail.id,
      dashboardName: detail.name,
      chartCount: detail.datacharts?.length ?? 0,
      plan: {
        totalWidgets: detail.widgets?.length ?? 0,
        executableUnits: plan.units.length,
        skippedUnits,
      },
      executedCount: results.length,
      successCount,
      failedCount,
      results,
      __blocks__: [
        createSummaryBlock({
          title: "看板执行摘要",
          sourceTool: "dataeye_dashboard_execute",
          items: [
            { label: "计划组件", value: plan.units.length },
            { label: "已执行组件", value: results.length },
            { label: "成功组件", value: successCount, tone: "success" },
            { label: "失败组件", value: failedCount, tone: failedCount > 0 ? "warning" : "default" },
            { label: "跳过组件", value: skippedUnits.length, tone: skippedUnits.length > 0 ? "warning" : "default" },
          ],
        }),
        ...(failedResults.length || skippedUnits.length
          ? createBlocksFromProfile(profileDiagnostics({ failedResults, skippedUnits }), {
              title: "看板执行诊断",
              sourceTool: "dataeye_dashboard_execute",
            })
          : []),
        ...blocks,
      ],
      message:
        units.length < plan.units.length
          ? `已执行前 ${units.length} 个可执行组件，可通过 maxUnits 调整上限`
          : "已按组件逐个执行看板查询",
    });
  });
}

export function resolveDashboardExecutableUnits(
  detail: DashboardDetail,
  options: { includeCharts?: boolean; includeViews?: boolean } = {},
): { units: DashboardExecutableUnit[]; skippedUnits: SkippedUnit[] } {
  const includeCharts = options.includeCharts !== false;
  const includeViews = options.includeViews !== false;
  const charts = new Map((detail.datacharts ?? []).map((chart) => [chart.id, chart]));
  const views = new Map((detail.views ?? []).map((view) => [view.id, view]));
  const units: DashboardExecutableUnit[] = [];
  const skippedUnits: SkippedUnit[] = [];
  const seen = new Set<string>();

  for (const widget of detail.widgets ?? []) {
    const chartId = widget.datachartId || widget.datachart_id;
    if (includeCharts && chartId) {
      const chart = charts.get(chartId);
      if (!chart) {
        skippedUnits.push({ unitId: `${widget.id}:${chartId}`, widgetId: widget.id, reason: `图表组件关联的 chartId 不存在：${chartId}` });
      } else {
        const config = parseRecord(chart.config);
        const viewId = chart.viewId || chart.view_id || stringValue(config.viewId) || stringValue(config.view_id);
        if (!viewId) {
          skippedUnits.push({ unitId: `${widget.id}:${chartId}`, widgetId: widget.id, reason: `图表缺少关联 viewId：${chartId}` });
        } else {
          const key = `${widget.id}:chart:${chartId}:${viewId}`;
          if (!seen.has(key)) {
            seen.add(key);
            units.push({
              unitId: key,
              unitType: "chart",
              widgetId: widget.id,
              widgetName: widget.name,
              chartId: chart.id,
              chartName: chart.name,
              viewId,
              viewName: views.get(viewId)?.name,
              chartConfig: chart.config,
              view: views.get(viewId),
            });
          }
        }
      }
    }

    if (includeViews) {
      for (const viewId of widget.viewIds || widget.view_ids || []) {
        const view = views.get(viewId);
        if (!view) {
          skippedUnits.push({ unitId: `${widget.id}:${viewId}`, widgetId: widget.id, reason: `视图组件关联的 viewId 不存在：${viewId}` });
          continue;
        }
        const key = `${widget.id}:view:${viewId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        units.push({
          unitId: key,
          unitType: "view",
          widgetId: widget.id,
          widgetName: widget.name,
          viewId,
          viewName: view.name,
          view,
        });
      }
    }
  }

  if (!detail.widgets?.length && includeCharts) {
    for (const chart of resolveExecutableCharts(detail)) {
      const key = `chart:${chart.id}:${chart.viewId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      units.push({
        unitId: key,
        unitType: "chart",
        chartId: chart.id,
        chartName: chart.name,
        viewId: chart.viewId,
        viewName: chart.view?.name,
        chartConfig: chart.config,
        view: chart.view,
      });
    }
  }

  return { units, skippedUnits };
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
  description: "执行 DataEye 看板类资源查询：可传看板名称、完整 ID 或用户原始引用；工具会先解析真实 relId，再逐个执行其中的图表和视图组件。不要把 folderId 当作 dashboardId，也不要凭历史猜 ID",
  inputSchema: {
    type: "object",
    properties: {
      dashboardId: { type: "string", description: "真实看板 relId。若不确定，请改传 dashboardRef，不要传 folderId" },
      dashboardName: { type: "string", description: "看板完整名称，可由工具解析为真实 relId" },
      dashboardRef: { type: "string", description: "用户提供的看板名称、完整 ID 或短引用。工具会解析，不能唯一命中则返回候选" },
      pageSize: { type: "number", description: "每个组件最多返回行数，默认 100", default: 100 },
      maxUnits: { type: "number", description: "最多执行组件数量，默认 20，最大 50", default: 20 },
      includeCharts: { type: "boolean", description: "是否执行图表组件，默认 true", default: true },
      includeViews: { type: "boolean", description: "是否执行直接视图组件，默认 true", default: true },
    },
  },
};
