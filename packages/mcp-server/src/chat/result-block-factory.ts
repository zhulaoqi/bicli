import {
  createBlockId,
  type ChartMessageBlock,
  type MessageBlock,
  type MetricCardsMessageBlock,
  type SummaryMessageBlock,
  type TableMessageBlock,
  type WarningMessageBlock,
} from "./message-blocks.js";
import type { ResultProfile } from "./result-profile.js";

type BlockContext = {
  title?: string;
  sourceTool?: string;
  toolCallId?: string;
  maxRows?: number;
};

type SummaryInput = {
  title: string;
  sourceTool?: string;
  toolCallId?: string;
  items: Array<{
    label: string;
    value: string | number;
    tone?: "default" | "success" | "warning" | "danger";
  }>;
};

export function createBlocksFromProfile(profile: ResultProfile, context: BlockContext = {}): MessageBlock[] {
  switch (profile.kind) {
    case "metrics":
      return [createMetricCardsBlock(profile, context)];
    case "time_series":
      return [createChartBlock(profile, context, "line")];
    case "category_chart":
      return [createCategoryChartBlock(profile, context)];
    case "table":
      return [createTableBlock(profile, context)];
    case "diagnostic":
      return [createWarningBlock(profile, context)];
    case "empty":
      return profile.reason
        ? [createWarningBlock({ kind: "diagnostic", severity: "info", items: [{ label: "结果为空", message: profile.reason }] }, context)]
        : [];
  }
}

export function createSummaryBlock(input: SummaryInput): SummaryMessageBlock {
  return baseBlock("summary", {
    title: input.title,
    sourceTool: input.sourceTool,
    toolCallId: input.toolCallId,
    payload: { items: input.items },
  });
}

function createMetricCardsBlock(
  profile: Extract<ResultProfile, { kind: "metrics" }>,
  context: BlockContext,
): MetricCardsMessageBlock {
  return baseBlock("metric_cards", {
    title: context.title || "核心指标",
    sourceTool: context.sourceTool,
    toolCallId: context.toolCallId,
    payload: {
      cards: profile.metrics,
    },
  });
}

function createChartBlock(
  profile: Extract<ResultProfile, { kind: "time_series" }>,
  context: BlockContext,
  chartType: "line" | "bar",
): ChartMessageBlock {
  return baseBlock("chart", {
    title: context.title || "趋势图",
    sourceTool: context.sourceTool,
    toolCallId: context.toolCallId,
    payload: {
      chartType,
      xField: profile.xField,
      yFields: profile.yFields,
      categories: profile.table.rows.map((row) => row[profile.xField]).filter(isChartValue),
      series: profile.yFields.map((field) => ({
        name: field,
        data: profile.table.rows.map((row) => toSeriesValue(row[field])),
      })),
    },
  });
}

function createCategoryChartBlock(
  profile: Extract<ResultProfile, { kind: "category_chart" }>,
  context: BlockContext,
): ChartMessageBlock {
  return baseBlock("chart", {
    title: context.title || "分类对比",
    sourceTool: context.sourceTool,
    toolCallId: context.toolCallId,
    payload: {
      chartType: "bar",
      xField: profile.categoryField,
      yFields: profile.valueFields,
      categories: profile.table.rows.map((row) => row[profile.categoryField]).filter(isChartValue),
      series: profile.valueFields.map((field) => ({
        name: field,
        data: profile.table.rows.map((row) => toSeriesValue(row[field])),
      })),
    },
  });
}

function createTableBlock(
  profile: Extract<ResultProfile, { kind: "table" }>,
  context: BlockContext,
): TableMessageBlock {
  const maxRows = context.maxRows ?? 100;
  return baseBlock("table", {
    title: context.title || "明细数据",
    sourceTool: context.sourceTool,
    toolCallId: context.toolCallId,
    payload: {
      columns: profile.columns,
      rows: profile.rows.slice(0, maxRows),
      total: profile.total,
      truncated: profile.truncated || profile.rows.length > maxRows,
    },
  });
}

function createWarningBlock(
  profile: Extract<ResultProfile, { kind: "diagnostic" }>,
  context: BlockContext,
): WarningMessageBlock {
  return baseBlock("warning", {
    title: context.title || "执行诊断",
    sourceTool: context.sourceTool,
    toolCallId: context.toolCallId,
    payload: {
      severity: profile.severity,
      message: profile.severity === "info" ? "结果提示" : "部分结果需要关注",
      details: profile.items.map((item) => `${item.label}：${item.message}`),
    },
  });
}

function baseBlock<T extends MessageBlock["type"], TPayload>(
  type: T,
  input: {
    title?: string;
    sourceTool?: string;
    toolCallId?: string;
    payload: TPayload;
  },
): Extract<MessageBlock, { type: T }> {
  return {
    id: createBlockId(type),
    type,
    title: input.title,
    sourceTool: input.sourceTool,
    toolCallId: input.toolCallId,
    createdAt: new Date().toISOString(),
    payload: input.payload,
  } as Extract<MessageBlock, { type: T }>;
}

function isChartValue(value: string | number | boolean | null): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function toSeriesValue(value: string | number | boolean | null): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}
