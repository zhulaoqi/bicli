import { describe, expect, it } from "vitest";
import {
  buildChartExecuteRequest,
  buildViewExecuteRequest,
} from "../datart-execute-request-builder.js";

function expectOk<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true; request: Record<string, any> } {
  expect(result.ok).toBe(true);
}

describe("datart execute request builder", () => {
  it("builds service-compatible aggregated chart requests", () => {
    const result = buildChartExecuteRequest({
      viewId: "view_1",
      vizId: "chart_1",
      vizName: "销售趋势",
      pageSize: 200,
      config: {
        aggregation: true,
        chartGraphId: "line",
        chartConfig: {
          datas: [
            {
              type: "group",
              rows: [{ colName: "event_date", type: "DATE", sort: { type: "ASC" } }],
            },
            {
              type: "aggregate",
              rows: [
                {
                  colName: "pay_amount",
                  type: "NUMERIC",
                  aggregate: "SUM",
                  filter: {
                    condition: {
                      operator: "GT",
                      value: 0,
                    },
                  },
                },
              ],
            },
            {
              type: "mixed",
              rows: [
                {
                  colName: "roi",
                  type: "NUMERIC",
                  aggregate: "AVG",
                  calculate: { type: "dateCompare", value: ["last"] },
                },
              ],
            },
            {
              type: "filter",
              rows: [
                {
                  colName: "country",
                  type: "STRING",
                  filter: { condition: { operator: "IN", value: ["US", "CN"] } },
                },
              ],
            },
          ],
        },
        styles: [{ key: "summary", rows: [{ key: "computed", value: { enable: true, method: "SUM" } }] }],
      },
      view: {
        id: "view_1",
        config: JSON.stringify({ cache: true, cacheExpires: 60 }),
        computedFields: [{ name: "event_week", expression: "week(event_date)", category: "DATE" }],
      },
      params: { p_date: ["2026-04-30"] },
    });

    expectOk(result);
    expect(result.request).toMatchObject({
      viewId: "view_1",
      vizId: "chart_1",
      vizName: "销售趋势",
      vizType: "DATACHART",
      chartGraphId: "line",
      cache: true,
      cacheExpires: 60,
      pageInfo: { pageNo: 1, pageSize: 200, countTotal: false },
      params: { p_date: ["2026-04-30"] },
      summary: { enable: true, method: "SUM" },
    });
    expect(result.request.groups).toEqual([{ alias: "event_date", column: ["event_date"] }]);
    expect(result.request.aggregators).toEqual([
      { alias: "SUM(pay_amount)", column: ["pay_amount"], sqlOperator: "SUM" },
      { alias: "AVG(roi)", column: ["roi"], sqlOperator: "AVG" },
    ]);
    expect(result.request.countAggregators).toEqual([
      { alias: "pay_amount", column: ["pay_amount"], sqlOperator: "SUM" },
      { alias: "roi", column: ["roi"], sqlOperator: "AVG" },
    ]);
    expect(result.request.filters).toEqual([
      {
        column: ["country"],
        sqlOperator: "IN",
        values: [
          { value: "US", valueType: "STRING" },
          { value: "CN", valueType: "STRING" },
        ],
      },
    ]);
    expect(result.request.orders).toEqual([{ column: ["event_date"], operator: "ASC", aggOperator: undefined }]);
    expect(result.request.calculate).toEqual([{ column: ["roi"], type: "dateCompare", value: ["last"] }]);
  });

  it("maps chart fields through view meta paths when available", () => {
    const result = buildChartExecuteRequest({
      viewId: "view_nested",
      config: {
        aggregation: true,
        chartConfig: {
          datas: [
            { type: "group", rows: [{ colName: "campaignName", type: "STRING" }] },
            { type: "aggregate", rows: [{ colName: "spend", type: "NUMERIC", aggregate: "SUM" }] },
          ],
        },
      },
      view: {
        id: "view_nested",
        meta: [
          { name: "campaignName", path: ["campaign", "name"] },
          { name: "spend", path: ["metrics", "spend"] },
        ],
      },
    });

    expectOk(result);
    expect(result.request.groups).toEqual([{ alias: "campaignName", column: ["campaign", "name"] }]);
    expect(result.request.aggregators).toEqual([
      { alias: "SUM(spend)", column: ["metrics", "spend"], sqlOperator: "SUM" },
    ]);
  });

  it("keeps date-level aliases and sends functionColumns for computed date groups", () => {
    const result = buildChartExecuteRequest({
      viewId: "view_date",
      config: {
        aggregation: true,
        computedFields: [
          {
            name: "date@date_level_delimiter@AGG_DATE_DAY",
            expression: "AGG_DATE_DAY([date])",
            type: "DATE",
            category: "dateLevelComputedField",
          },
        ],
        chartConfig: {
          datas: [
            {
              type: "group",
              rows: [
                {
                  colName: "date@date_level_delimiter@AGG_DATE_DAY",
                  type: "DATE",
                  category: "dateLevelComputedField",
                  expression: "AGG_DATE_DAY([date])",
                },
              ],
            },
            {
              type: "aggregate",
              rows: [{ colName: "impressions", type: "NUMERIC", aggregate: "SUM" }],
            },
          ],
        },
      },
      view: {
        id: "view_date",
        meta: [
          { name: "date", path: ["date"] },
          { name: "impressions", path: ["impressions"] },
        ],
      },
    });

    expectOk(result);
    expect(result.request.groups).toEqual([
      {
        alias: "date@date_level_delimiter@AGG_DATE_DAY",
        column: ["date@date_level_delimiter@AGG_DATE_DAY"],
      },
    ]);
    expect(result.request.functionColumns).toEqual([
      {
        alias: "date@date_level_delimiter@AGG_DATE_DAY",
        category: "dateLevelComputedField",
        snippet: "AGG_DATE_DAY([date])",
      },
    ]);
  });

  it("builds raw chart requests with selected columns when aggregation is disabled", () => {
    const result = buildChartExecuteRequest({
      viewId: "view_1",
      pageSize: 50,
      config: {
        aggregation: false,
        chartConfig: {
          datas: [
            { type: "group", rows: [{ colName: "campaign", type: "STRING" }] },
            { type: "aggregate", rows: [{ colName: "cost", type: "NUMERIC", aggregate: "SUM" }] },
          ],
        },
      },
    });

    expectOk(result);
    expect(result.request.columns).toEqual([
      { alias: "campaign", column: ["campaign"] },
      { alias: "SUM(cost)", column: ["cost"] },
    ]);
    expect(result.request.aggregators).toEqual([]);
    expect(result.request.groups).toEqual([]);
  });

  it("builds direct view detail requests from view metadata", () => {
    const result = buildViewExecuteRequest({
      viewId: "view_2",
      viewName: "订单明细",
      pageSize: 20,
      view: {
        id: "view_2",
        name: "订单明细",
        config: { cache: false },
        meta: [
          { name: "order_id", path: ["order_id"], type: "STRING" },
          { name: "amount", path: ["amount"], type: "NUMERIC" },
        ],
      },
    });

    expectOk(result);
    expect(result.request).toMatchObject({
      viewId: "view_2",
      vizName: "订单明细",
      vizType: "VIEW",
      pageInfo: { pageNo: 1, pageSize: 20, countTotal: false },
      columns: [
        { alias: "order_id", column: ["order_id"] },
        { alias: "amount", column: ["amount"] },
      ],
    });
  });

  it("returns unsupported when a direct view has no inferable columns", () => {
    expect(buildViewExecuteRequest({ viewId: "view_empty", view: { id: "view_empty" } })).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_VIEW_CONFIG",
    });
  });
});
