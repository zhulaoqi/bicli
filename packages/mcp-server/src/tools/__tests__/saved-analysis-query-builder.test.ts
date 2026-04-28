import { describe, expect, it } from "vitest";
import { buildSavedAnalysisQuery, getSavedAnalysisEndpoint } from "../saved-analysis-query-builder.js";

describe("getSavedAnalysisEndpoint", () => {
  it("maps supported saved analysis types to direct report endpoints", () => {
    expect(getSavedAnalysisEndpoint(1)).toBe("/api/my-query-event/report");
    expect(getSavedAnalysisEndpoint(2)).toBe("/api/funnel-analysis/report");
    expect(getSavedAnalysisEndpoint(3)).toBe("/api/my-query-retention/report");
    expect(getSavedAnalysisEndpoint(4)).toBeUndefined();
  });
});

describe("buildSavedAnalysisQuery", () => {
  it("builds an event analysis request with metrics, dimensions and filters", () => {
    const built = buildSavedAnalysisQuery({
      id: 2661,
      name: "总计没有显示",
      type: 1,
      projectId: 12383,
      productId: 17103,
      productIds: "17103",
      queryStartTime: "2025-12-05",
      queryEndTime: "2025-12-09",
      timeCompareType: 8,
      granularityType: 1,
      timezone: 0,
      eventAnalysisQuery: {
        relationFilter: "and",
        indexInfos: [
          {
            eventId: "309",
            eventName: "purchase",
            analysis: "total_times",
            filters: [{ columnName: "country_code", calculateSymbol: "EQ", ftv: ["BR"] }],
          },
        ],
        dimensionInfos: [{ columnName: "country_code", columnId: "12" }],
        filterInfos: [{ columnName: "hday", calculateSymbol: "BETWEEN", ftv: ["2025-12-05", "2025-12-09"] }],
      },
    });

    expect(built.ok).toBe(true);
    expect(built.ok && built.endpoint).toBe("/api/my-query-event/report");
    expect(built.ok && built.body).toMatchObject({
      name: "总计没有显示",
      projectId: 12383,
      productId: 17103,
      productIds: "17103",
      queryStartTime: "2025-12-05",
      queryEndTime: "2025-12-09",
      timeCompareType: 8,
      granularityType: 1,
      timezone: 0,
      relationFilter: "and",
    });
    expect(built.ok && built.body.indexInfos).toEqual([
      {
        eventId: "309",
        eventName: "purchase",
        analysis: "total_times",
        productId: 17103,
        filters: [{ columnName: "country_code", calculateSymbol: "EQ", ftv: ["BR"], productId: 17103 }],
      },
    ]);
    expect(built.ok && built.body.dimensionInfos).toEqual([{ columnName: "country_code", columnId: "12", productId: 17103 }]);
    expect(built.ok && built.body.filterInfos).toEqual([
      { columnName: "hday", calculateSymbol: "BETWEEN", ftv: ["2025-12-05", "2025-12-09"], productId: 17103 },
    ]);
  });

  it("builds a funnel analysis request from a raw database-like row", () => {
    const built = buildSavedAnalysisQuery({
      id: 4364,
      name: "PaymentConversionAnalysis",
      type: 2,
      project_id: 558,
      product_id: 17103,
      product_ids: "17103",
      query_start_time: "2025-10-29",
      query_end_time: "2025-11-04",
      time_compare_type: 1,
      granularity_type: 1,
      timezone: 0,
      is_default: 1,
      prp: JSON.stringify({
        showSummary: false,
        chartType: "FUNNEL",
        conversionType: "CONVERSION_RATE",
        windowsDate: 1,
        windowsDateUnit: "DAY",
        relationFilter: "and",
        indexInfos: [
          { eventId: "anythingEvent", eventNameDisplay: "Visit", filters: [] },
          { eventId: "310", eventNameDisplay: "Activation", filters: [] },
          { eventId: "309", eventNameDisplay: "PaymentSuccessful", filters: [] },
        ],
      }),
    });

    expect(built.ok).toBe(true);
    expect(built.ok && built.endpoint).toBe("/api/funnel-analysis/report");
    expect(built.ok && built.body).toMatchObject({
      chartType: "FUNNEL",
      conversionType: "CONVERSION_RATE",
      windowsDate: 1,
      windowsDateUnit: "DAY",
      projectId: 558,
      productId: 17103,
      productIds: "17103",
      queryStartTime: "2025-10-29",
      queryEndTime: "2025-11-04",
      timeCompareType: 1,
      granularityType: 1,
      timezone: 0,
      isDefault: 1,
    });
    expect(built.ok && (built.body.indexInfos as Array<Record<string, unknown>>)).toHaveLength(3);
    expect(built.ok && (built.body.indexInfos as Array<Record<string, unknown>>)[1]).toMatchObject({
      eventId: "310",
      productId: 17103,
      filters: [],
    });
  });

  it("builds a retention analysis request with retention-specific nested indexes", () => {
    const built = buildSavedAnalysisQuery({
      id: 3001,
      name: "次日留存",
      type: 3,
      projectId: 558,
      productId: 17103,
      queryStartTime: "2025-10-29",
      queryEndTime: "2025-11-04",
      retentionAnalysisQuery: {
        retention: "N_DAY",
        dayType: 1,
        displayDays: [1, 2, 3, 7],
        firstIndex: { eventId: "310", filters: [] },
        indexInfo: { eventId: "309", filters: [{ columnName: "country_code", ftv: ["BR"] }] },
        indexInfoChl: { eventId: "4265" },
        dimensionInfos: [{ columnName: "country_code", columnId: "12" }],
      },
    });

    expect(built.ok).toBe(true);
    expect(built.ok && built.endpoint).toBe("/api/my-query-retention/report");
    expect(built.ok && built.body.firstIndex).toMatchObject({ eventId: "310", productId: 17103, filters: [] });
    expect(built.ok && built.body.indexInfo).toMatchObject({
      eventId: "309",
      productId: 17103,
      filters: [{ columnName: "country_code", ftv: ["BR"], productId: 17103 }],
    });
    expect(built.ok && built.body.indexInfoChl).toMatchObject({ eventId: "4265", productId: 17103 });
    expect(built.ok && built.body.dimensionInfos).toEqual([{ columnName: "country_code", columnId: "12", productId: 17103 }]);
  });

  it("returns a readable error when required fields are missing", () => {
    const built = buildSavedAnalysisQuery({
      id: 999,
      type: 2,
      projectId: 558,
      funnelAnalysisQueryParam: {
        indexInfos: [{ eventId: "310" }],
      },
    });

    expect(built).toMatchObject({
      ok: false,
      code: "INVALID_SAVED_ANALYSIS_QUERY",
    });
    expect(!built.ok && built.message).toContain("productId");
    expect(!built.ok && built.message).toContain("indexInfos");
  });
});
