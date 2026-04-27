import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件分析查询
 * POST /api/my-query-event/report (@RequestBody EventAnalysisQuery)
 * 支持趋势、对比、分布分析
 */
export async function dateyeEventAnalysis(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, appId, startDate, endDate, type, measures, groupBy, filters, timeUnit = "day" } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!appId) return formatError("INVALID_ARGS", "appId is required (get from product detail)");
    if (!startDate || !endDate) return formatError("INVALID_ARGS", "startDate and endDate are required (format: YYYY-MM-DD)");
    if (!measures || !Array.isArray(measures) || (measures as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "measures is required and must contain at least one metric");
    }
    const validTypes = ["event", "funnel", "retention"];
    if (type && !validTypes.includes(String(type))) {
      return formatError("INVALID_ARGS", `type must be one of: ${validTypes.join(", ")}`);
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      appId: String(appId),
      startDate: String(startDate),
      endDate: String(endDate),
      type: type || "event",
      measures,
      timeUnit: String(timeUnit),
    };
    if (groupBy) body.groupBy = groupBy;
    if (filters) body.filters = filters;

    const data = await dateyeRequest("/api/my-query-event/report", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventAnalysisDef = {
  name: "dataeye_event_analysis",
  description: "事件分析查询（AI 问数 2.0）：支持事件趋势/对比/分布分析，比 SQL 查询更高层，直接生成图表数据。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      appId: { type: "string", description: "产品 appId（必填，从产品详情获取）" },
      startDate: { type: "string", description: "开始日期，格式 YYYY-MM-DD（必填）" },
      endDate: { type: "string", description: "结束日期，格式 YYYY-MM-DD（必填）" },
      type: { type: "string", description: "分析类型：event=事件分析, funnel=漏斗, retention=留存", default: "event" },
      measures: {
        type: "array",
        description: "指标列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            eventName: { type: "string", description: "事件名" },
            aggregation: { type: "string", description: "聚合方式：count/user_count/sum/avg" },
            propertyName: { type: "string", description: "属性名（sum/avg 时必填）" },
          },
          required: ["eventName", "aggregation"],
        },
      },
      groupBy: {
        type: "array",
        description: "分组维度（可选）",
        items: {
          type: "object",
          properties: { propertyName: { type: "string" } },
          required: ["propertyName"],
        },
      },
      filters: {
        type: "array",
        description: "过滤条件（可选）",
        items: {
          type: "object",
          properties: {
            propertyName: { type: "string" },
            operator: { type: "string", description: "eq/ne/in/gt/lt" },
            values: { type: "array", items: { type: "string" } },
          },
          required: ["propertyName", "operator", "values"],
        },
      },
      timeUnit: { type: "string", description: "时间粒度：day/week/month，默认 day", default: "day" },
      _context: { type: "object" },
    },
    required: ["productId", "appId", "startDate", "endDate", "measures", "_context"],
  },
};
