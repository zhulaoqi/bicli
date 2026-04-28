import { describe, expect, it } from "vitest";
import { buildSavedAnalysisQuery } from "../saved-analysis-query-builder.js";

describe("buildSavedAnalysisQuery compatibility coverage", () => {
  it("merges saved analysis table fields into the prp query payload", () => {
    const result = buildSavedAnalysisQuery({
      id: 4364,
      type: 2,
      projectId: 558,
      productId: 17103,
      productIds: "17103",
      timeCompareType: 1,
      granularityType: undefined,
      queryStartTime: "2025-10-29",
      queryEndTime: "2025-11-04",
      timeFilterType: undefined,
      timezone: 0,
      funnelAnalysisQueryParam: {
        showSummary: false,
        relationFilter: "and",
        indexInfos: [{ eventId: "anythingEvent" }, { eventId: "310" }],
        productId: 99999,
      },
      eventAnalysisQuery: null,
      retentionAnalysisQuery: null,
      prp: null,
    });

    expect(result.ok && result.body).toMatchObject({
      showSummary: false,
      relationFilter: "and",
      indexInfos: [{ eventId: "anythingEvent", productId: 17103 }, { eventId: "310", productId: 17103 }],
      projectId: 558,
      productId: 17103,
      productIds: "17103",
      timeCompareType: 1,
      queryStartTime: "2025-10-29",
      queryEndTime: "2025-11-04",
      timezone: 0,
    });
  });

  it("parses prp and snake_case table fields from a raw database-like row", () => {
    const result = buildSavedAnalysisQuery({
      id: 4364,
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
          { eventId: "anythingEvent", eventNameDisplay: "Visit" },
          { eventId: "310", eventNameDisplay: "Activation" },
        ],
      }),
    });

    expect(result.ok && result.body).toMatchObject({
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
  });

  it("keeps metric, dimension and filter configs while normalizing nested productId", () => {
    const result = buildSavedAnalysisQuery({
      id: 2661,
      type: 1,
      projectId: 12383,
      productId: 17103,
      queryStartTime: "2025-12-05",
      queryEndTime: "2025-12-09",
      eventAnalysisQuery: {
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
      funnelAnalysisQueryParam: null,
      retentionAnalysisQuery: null,
      prp: null,
    });

    expect(result.ok && result.body.indexInfos).toEqual([
      {
        eventId: "309",
        eventName: "purchase",
        analysis: "total_times",
        productId: 17103,
        filters: [{ columnName: "country_code", calculateSymbol: "EQ", ftv: ["BR"], productId: 17103 }],
      },
    ]);
    expect(result.ok && result.body.dimensionInfos).toEqual([{ columnName: "country_code", columnId: "12", productId: 17103 }]);
    expect(result.ok && result.body.filterInfos).toEqual([
      { columnName: "hday", calculateSymbol: "BETWEEN", ftv: ["2025-12-05", "2025-12-09"], productId: 17103 },
    ]);
  });
});
