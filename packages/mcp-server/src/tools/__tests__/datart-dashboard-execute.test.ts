import { describe, expect, it } from "vitest";
import { buildChartDataRequestBody } from "../datart-data-execute.js";
import { resolveExecutableCharts } from "../datart-dashboard-execute.js";

describe("dashboard chart execution helpers", () => {
  it("resolves executable charts from dashboard detail by chart viewId", () => {
    const charts = resolveExecutableCharts({
      id: "dashboard_1",
      datacharts: [
        { id: "chart_1", name: "趋势图", viewId: "view_1", config: "{}" },
        { id: "chart_2", name: "缺少视图", config: "{}" },
      ],
      views: [{ id: "view_1", name: "订单视图" }],
    });

    expect(charts).toEqual([
      {
        id: "chart_1",
        name: "趋势图",
        viewId: "view_1",
        config: "{}",
        view: { id: "view_1", name: "订单视图" },
      },
    ]);
  });

  it("builds a non-empty chart query body from saved chart config", () => {
    const body = buildChartDataRequestBody({
      viewId: "view_1",
      vizId: "chart_1",
      pageSize: 50,
      config: JSON.stringify({
        aggregation: true,
        chartConfig: {
          datas: [
            {
              type: "group",
              rows: [{ colName: "event_date", type: "DATE" }],
            },
            {
              type: "aggregate",
              rows: [{ colName: "pay_amount", type: "NUMERIC", aggregate: "SUM" }],
            },
          ],
        },
      }),
    });

    expect(body).toMatchObject({
      viewId: "view_1",
      vizId: "chart_1",
      vizType: "DATACHART",
      pageInfo: { pageNo: 1, pageSize: 50 },
      groups: [{ alias: "event_date", column: ["event_date"] }],
      aggregators: [{ alias: "SUM(pay_amount)", column: ["pay_amount"], sqlOperator: "SUM" }],
    });
  });
});
