import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import { buildSavedAnalysisQuery, type SavedAnalysisDetail } from "./saved-analysis-query-builder.js";
import { createBlocksFromProfile } from "../chat/result-block-factory.js";
import { profileDataframe, profileDiagnostics } from "../chat/result-profile.js";
import type { MessageBlock } from "../chat/message-blocks.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

// 分析类型
const ANALYSIS_TYPE: Record<number, string> = {
  1: "事件分析",
  2: "漏斗分析",
  3: "留存分析",
  4: "用户行为分析",
};

/**
 * 执行已保存的自助分析，返回结果摘要
 * 步骤：
 *   1. GET /api/self-analysis-event/detail/{id} 获取分析配置
 *   2. 根据 type 选择执行端点，POST prp 数据
 *   3. 提取关键指标摘要返回
 */
export async function dateyeAnalysisExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { analysisId } = cleanArgs;

    if (!analysisId) return formatError("INVALID_ARGS", "analysisId is required — 先调 dataeye_analysis_list 获取");

    // Step 1: 获取分析详情
    const detail = await dateyeRequest<SavedAnalysisDetail & {
      id: number;
      name: string;
      status: number;
      projectId: number;
      productId: number;
      represent: string | null;
    }>(`/api/self-analysis-event/detail/${analysisId}`, context, { method: "GET" });

    if (!detail) {
      return formatError("NOT_FOUND", `分析 ID=${analysisId} 不存在或无权访问`);
    }

    const typeName = ANALYSIS_TYPE[detail.type] ?? `类型${detail.type}`;
    const built = buildSavedAnalysisQuery(detail);

    if (!built.ok && detail.type === 4) {
      return formatError(
        "UNSUPPORTED",
        `「${typeName}」类型暂不支持 AI 直接执行，请在 DataEye 平台界面操作`,
      );
    }

    if (!built.ok) {
      return formatError("INVALID_STATE", built.message);
    }

    console.log("[analysis-execute]", {
      analysisId: detail.id,
      type: detail.type,
      endpoint: built.endpoint,
      ...summarizeExecutionBody(built.body),
    });

    // Step 3: 执行分析
    const rawResult = await dateyeRequest<Record<string, unknown>>(built.endpoint, context, {
      method: "POST",
      body: built.body,
    });

    // Step 4: 提取摘要
    const summary = extractSummary(detail.type, rawResult, detail.name);

    const chartData = extractChartData(detail.type, rawResult, detail.name);
    const blocks = createAnalysisBlocks(detail.type, rawResult, detail.name);

    return formatSuccess({
      analysisId: detail.id,
      analysisName: detail.name,
      analysisType: typeName,
      projectId: detail.projectId,
      productId: detail.productId,
      description: detail.represent,
      query: summarizeExecutionBody(built.body),
      summary,
      displayHint: blocks.length ? "structured_blocks" : "summary_only",
      // __chart__ 由 stream.ts 拦截后通过 SSE 单独发送给前端，不会出现在 LLM 上下文中
      ...(chartData ? { __chart__: chartData } : {}),
      ...(blocks.length ? { __blocks__: blocks } : {}),
    });
  });
}

function summarizeExecutionBody(body: Record<string, unknown>) {
  return {
    projectId: body.projectId,
    productId: body.productId,
    indexInfosCount: Array.isArray(body.indexInfos) ? body.indexInfos.length : 0,
    dimensionInfosCount: Array.isArray(body.dimensionInfos) ? body.dimensionInfos.length : 0,
    filterInfosCount: Array.isArray(body.filterInfos) ? body.filterInfos.length : 0,
    hasQueryStartTime: Boolean(body.queryStartTime),
    hasQueryEndTime: Boolean(body.queryEndTime),
  };
}

/**
 * 根据分析类型提取结构化摘要
 */
export function extractSummary(type: number, data: Record<string, unknown>, name: string): Record<string, unknown> {
  try {
    if (type === 1) {
      // 事件分析：提取趋势数据
      const xAxis = getEventXAxis(data);
      const series = getEventSeries(data);
      const totalMap = (data.total as Record<string, number>) ?? {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const resultStatus = xAxis.length === 0 && rows.length === 0 && series.length === 0 ? "empty" : "ok";

      return {
        resultStatus,
        dateRange: xAxis.length > 0 ? `${xAxis[0]} ~ ${xAxis[xAxis.length - 1]}` : "unknown",
        dataPoints: xAxis.length,
        rowCount: rows.length,
        metrics: series.slice(0, 5).map((s) => ({
          name: s.name,
          values: s.data?.slice(0, 7) ?? [], // 最近7条
          total: totalMap[s.name] ?? sumNumberSeries(s.data),
        })),
        interpretation: resultStatus === "empty"
          ? {
              conclusion: "本次执行返回 0 条数据。",
              evidence: "工具结果仅能证明当前查询条件下无数据点或无返回行。",
              guardrail: "不要输出未经验证的原因推断；若需要排查原因，必须先调用能验证该原因的工具或让用户提供日志证据。",
            }
          : undefined,
        hint: series.length > 5 ? `还有 ${series.length - 5} 条指标未展示` : undefined,
      };
    }

    if (type === 2) {
      // 漏斗分析：提取转化率
      type FunnelStep = {
        stepName?: string;
        eventName?: string;
        count?: number;
        conversionRate?: number | string;
        totalConversionRate?: number | string;
      };
      const funnelData: FunnelStep[] =
        (data.funnelData as FunnelStep[]) ?? (data.series as FunnelStep[]) ?? [];

      return {
        steps: funnelData.map((step) => ({
          step: step.stepName ?? step.eventName,
          count: step.count,
          conversionRate: step.conversionRate,
          totalConversionRate: step.totalConversionRate,
        })),
        overallConversion:
          funnelData.length >= 2
            ? funnelData[funnelData.length - 1]?.totalConversionRate
            : null,
      };
    }

    if (type === 3) {
      // 留存分析：提取留存矩阵前几行
      type RetentionRow = { date?: string; total?: number; retentions?: number[] };
      const retentionData: RetentionRow[] =
        (data.retentionData as RetentionRow[]) ?? (data.data as RetentionRow[]) ?? [];

      return {
        rows: retentionData.slice(0, 10).map((row) => ({
          date: row.date,
          initialUsers: row.total,
          retentionRates: row.retentions?.slice(0, 7) ?? [],
        })),
        totalRows: retentionData.length,
        hint: retentionData.length > 10 ? `仅展示最近 10 行（共 ${retentionData.length} 行）` : undefined,
      };
    }
  } catch {
    // 提取失败时返回原始数据顶层字段列表
  }

  return {
    message: `「${name}」执行成功，返回数据结构未知`,
    topLevelKeys: Object.keys(data).slice(0, 20),
  };
}

/** 图表数据结构（发往前端 chart_data SSE） */
export interface AnalysisChartData {
  chartType: "line" | "bar" | "funnel" | "heatmap";
  title: string;
  xAxis?: string[];
  series?: Array<{ name: string; data: (number | null)[] }>;
  funnelSteps?: Array<{ name: string; value: number; rate?: string }>;
  heatmapRows?: Array<{ date: string; initialUsers: number; retentions: (number | null)[] }>;
}

export function extractChartData(type: number, data: Record<string, unknown>, name: string): AnalysisChartData | null {
  try {
    if (type === 1) {
      const xAxis = getEventXAxis(data);
      const series = getEventSeries(data);
      if (!xAxis.length || !series.length) return null;
      return {
        chartType: "line",
        title: name,
        xAxis,
        series: series.slice(0, 6).map((s) => ({ name: s.name, data: s.data ?? [] })),
      };
    }
    if (type === 2) {
      type FunnelStep = { stepName?: string; eventName?: string; count?: number; conversionRate?: number | string };
      const steps: FunnelStep[] = (data.funnelData as FunnelStep[]) ?? (data.series as FunnelStep[]) ?? [];
      if (!steps.length) return null;
      return {
        chartType: "funnel",
        title: name,
        funnelSteps: steps.map((s) => ({
          name: (s.stepName ?? s.eventName ?? "步骤").slice(0, 20),
          value: s.count ?? 0,
          rate: s.conversionRate != null ? `${s.conversionRate}%` : undefined,
        })),
      };
    }
    if (type === 3) {
      type RetRow = { date?: string; total?: number; retentions?: (number | null)[] };
      const rows: RetRow[] = (data.retentionData as RetRow[]) ?? (data.data as RetRow[]) ?? [];
      if (!rows.length) return null;
      return {
        chartType: "heatmap",
        title: name,
        heatmapRows: rows.slice(0, 14).map((r) => ({
          date: r.date ?? "",
          initialUsers: r.total ?? 0,
          retentions: (r.retentions ?? []).slice(0, 8),
        })),
      };
    }
  } catch {
    // 提取失败静默跳过
  }
  return null;
}

export function createAnalysisBlocks(type: number, data: Record<string, unknown>, name: string): MessageBlock[] {
  const chartData = extractChartData(type, data, name);
  if (chartData?.chartType === "line" && chartData.xAxis?.length && chartData.series?.length) {
    return createBlocksFromProfile(profileDataframe({
      columns: [{ name: "date" }, ...chartData.series.map((series) => ({ name: series.name }))],
      rows: chartData.xAxis.map((xValue, index) => [
        xValue,
        ...chartData.series!.map((series) => series.data[index] ?? null),
      ]),
      pageInfo: { total: chartData.xAxis.length },
    }), {
      title: name,
      sourceTool: "dataeye_analysis_execute",
    });
  }

  if (chartData?.chartType === "funnel" && chartData.funnelSteps?.length) {
    return createBlocksFromProfile(profileDataframe({
      columns: [{ name: "step" }, { name: "count" }, { name: "rate" }],
      rows: chartData.funnelSteps.map((step) => [step.name, step.value, step.rate ?? null]),
      pageInfo: { total: chartData.funnelSteps.length },
    }), {
      title: name,
      sourceTool: "dataeye_analysis_execute",
    });
  }

  if (chartData?.chartType === "heatmap" && chartData.heatmapRows?.length) {
    return createBlocksFromProfile(profileDataframe({
      columns: [{ name: "date" }, { name: "initialUsers" }, ...Array.from({ length: 8 }, (_, index) => ({ name: `day_${index}` }))],
      rows: chartData.heatmapRows.map((row) => [
        row.date,
        row.initialUsers,
        ...Array.from({ length: 8 }, (_, index) => row.retentions[index] ?? null),
      ]),
      pageInfo: { total: chartData.heatmapRows.length },
    }), {
      title: name,
      sourceTool: "dataeye_analysis_execute",
      maxRows: 14,
    });
  }

  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length && rows.every(isRecord)) {
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    return createBlocksFromProfile(profileDataframe({
      columns: columns.map((column) => ({ name: column })),
      rows: rows.map((row) => columns.map((column) => row[column])),
      pageInfo: { total: rows.length },
    }), {
      title: name,
      sourceTool: "dataeye_analysis_execute",
      maxRows: 20,
    });
  }

  const summary = extractSummary(type, data, name);
  if (summary.resultStatus === "empty") {
    return createBlocksFromProfile({
      kind: "empty",
      reason: "本次执行返回 0 条数据；当前工具结果不足以证明原因",
    }, {
      title: name,
      sourceTool: "dataeye_analysis_execute",
    });
  }

  return [];
}

function getEventXAxis(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.xAxis)) {
    return data.xAxis.map(String);
  }
  const chart = isRecord(data.chart) ? data.chart : {};
  if (Array.isArray(chart.x)) {
    return chart.x.map(String);
  }
  return [];
}

function getEventSeries(data: Record<string, unknown>): Array<{ name: string; data: (number | null)[] }> {
  if (Array.isArray(data.series)) {
    return data.series.map((series, index) => {
      const item = isRecord(series) ? series : {};
      return {
        name: String(item.name ?? `指标${index + 1}`),
        data: toNumberArray(item.data),
      };
    });
  }

  const chart = isRecord(data.chart) ? data.chart : {};
  const y = isRecord(chart.y) ? chart.y : {};
  const result: Array<{ name: string; data: (number | null)[] }> = [];

  for (const [metricName, metricValue] of Object.entries(y)) {
    const groups = Array.isArray(metricValue) ? metricValue : [];
    for (const [index, group] of groups.entries()) {
      const groupRecord = isRecord(group) ? group : {};
      const groupName = Array.isArray(groupRecord.groupCol)
        ? groupRecord.groupCol.map(String).join(" / ")
        : String(groupRecord.groupCol ?? "");
      result.push({
        name: groupName ? `${metricName} / ${groupName}` : `${metricName}${groups.length > 1 ? ` #${index + 1}` : ""}`,
        data: toNumberArray(groupRecord.value),
      });
    }
  }

  return result;
}

function toNumberArray(value: unknown): (number | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item === null || item === undefined || item === "") return null;
    const num = Number(item);
    return Number.isFinite(num) ? num : null;
  });
}

function sumNumberSeries(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const dateyeAnalysisExecuteDef = {
  name: "dataeye_analysis_execute",
  description: "执行一个已保存的自助分析（事件/漏斗/留存），返回分析结果数据摘要。先用 dataeye_analysis_list 获取分析 ID",
  inputSchema: {
    type: "object",
    properties: {
      analysisId: {
        type: "number",
        description: "自助分析的 ID，从 dataeye_analysis_list 获取",
      },
    },
    required: ["analysisId"],
  },
};
