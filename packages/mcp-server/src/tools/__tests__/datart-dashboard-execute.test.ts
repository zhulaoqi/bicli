import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChartDataRequestBody } from "../datart-data-execute.js";
import {
  datartDashboardExecute,
  resolveDashboardExecutableUnits,
  resolveExecutableCharts,
} from "../datart-dashboard-execute.js";

const adapter = {
  resolveIdentity: vi.fn(async () => ({ userId: "u1", role: "admin", orgId: "org_1" })),
  getPermissions: vi.fn(async () => []),
};

function parseToolResponse(response: any) {
  return JSON.parse(response.content[0].text);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

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

  it("plans chart widgets and direct view widgets with skipped reasons", () => {
    const plan = resolveDashboardExecutableUnits({
      id: "dashboard_1",
      widgets: [
        { id: "widget_chart", name: "图表组件", datachartId: "chart_1" },
        { id: "widget_view", name: "视图组件", viewIds: ["view_2"] },
        { id: "widget_missing", name: "坏组件", viewIds: ["missing_view"] },
      ],
      datacharts: [
        {
          id: "chart_1",
          name: "趋势图",
          viewId: "view_1",
          config: { chartConfig: { datas: [{ type: "aggregate", rows: [{ colName: "amount", aggregate: "SUM", type: "NUMERIC" }] }] } },
        },
      ],
      views: [
        { id: "view_1", name: "图表视图" },
        { id: "view_2", name: "直接视图", meta: [{ name: "order_id", path: ["order_id"] }] },
      ],
    });

    expect(plan.units).toMatchObject([
      { unitType: "chart", widgetId: "widget_chart", chartId: "chart_1", viewId: "view_1" },
      { unitType: "view", widgetId: "widget_view", viewId: "view_2" },
    ]);
    expect(plan.skippedUnits).toEqual([
      { unitId: "widget_missing:missing_view", widgetId: "widget_missing", reason: "视图组件关联的 viewId 不存在：missing_view" },
    ]);
  });

  it("resolves dashboard names to relId before executing units", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const calls: Array<{ url: string; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/api/v1/viz/folders/type")) {
        return Response.json({
          success: true,
          data: [
            {
              id: "folder_1",
              relId: "1234567890abcdef1234567890abcdef",
              name: "WGT-Widget-创意分析看板",
            },
          ],
        });
      }
      if (url.includes("/api/v1/viz/dashboards/1234567890abcdef1234567890abcdef")) {
        return Response.json({
          success: true,
          data: {
            id: "1234567890abcdef1234567890abcdef",
            name: "WGT-Widget-创意分析看板",
            widgets: [{ id: "widget_1", name: "图表组件", datachartId: "chart_1" }],
            datacharts: [
              {
                id: "chart_1",
                name: "趋势图",
                viewId: "view_1",
                config: {
                  chartConfig: {
                    datas: [{ type: "aggregate", rows: [{ colName: "amount", aggregate: "SUM", type: "NUMERIC" }] }],
                  },
                },
              },
            ],
            views: [{ id: "view_1", name: "订单视图" }],
          },
        });
      }
      if (url.includes("/api/v1/data-provider/execute")) {
        return Response.json({
          success: true,
          data: { columns: [{ name: "SUM(amount)" }], rows: [[100]], pageInfo: { total: 1 } },
        });
      }
      return Response.json({ success: false, message: "unexpected call" });
    }) as any);

    const response = await datartDashboardExecute({} as any, adapter as any, {
      dashboardRef: "WGT-Widget-创意分析看板",
      pageSize: 20,
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });
    const parsed = parseToolResponse(response);

    expect(parsed.success).toBe(true);
    expect(parsed.data.resolvedResource).toMatchObject({
      id: "1234567890abcdef1234567890abcdef",
      name: "WGT-Widget-创意分析看板",
      folderId: "folder_1",
      matchedBy: "name",
    });
    expect(calls.some((call) => call.url.includes("/api/v1/viz/dashboards/folder_1"))).toBe(false);
    expect(calls.some((call) => call.url.includes("/api/v1/viz/dashboards/1234567890abcdef1234567890abcdef"))).toBe(true);
    expect(calls.find((call) => call.url.includes("/api/v1/data-provider/execute"))?.body).toMatchObject({
      viewId: "view_1",
      vizId: "chart_1",
      pageInfo: { pageNo: 1, pageSize: 20 },
    });
    expect(parsed.data.__blocks__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "summary",
          title: "看板执行摘要",
          payload: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ label: "成功组件", value: 1 }),
            ]),
          }),
        }),
        expect.objectContaining({
          type: "metric_cards",
          title: "趋势图",
        }),
      ]),
    );
  });

  it("returns candidates without executing when dashboard ref is ambiguous", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const fetchMock = vi.fn(async () => Response.json({
      success: true,
      data: [
        { id: "folder_1", relId: "abcdef11111111111111111111111111", name: "DSP A" },
        { id: "folder_2", relId: "abcdef22222222222222222222222222", name: "DSP B" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock as any);

    const response = await datartDashboardExecute({} as any, adapter as any, {
      dashboardRef: "abcdef",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });
    const parsed = parseToolResponse(response);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("AMBIGUOUS_RESOURCE");
    expect(parsed.error.message).toContain("找到 2 个匹配的看板");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes service dashboard not-found errors", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/v1/viz/folders/type")) {
        return Response.json({
          success: true,
          data: [{ id: "folder_1", relId: "1234567890abcdef1234567890abcdef", name: "已删除看板" }],
        });
      }
      return Response.json({ success: false, message: "resource.dashboard 不存在", errCode: 50024 });
    }) as any);

    const response = await datartDashboardExecute({} as any, adapter as any, {
      dashboardRef: "已删除看板",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });
    const parsed = parseToolResponse(response);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("NOT_FOUND");
    expect(parsed.error.message).toContain("可能传入了 folderId");
    expect(parsed.error.message).not.toContain("INTERNAL_ERROR");
  });

  it("returns an execution failure when all planned units are unsupported", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/v1/viz/folders/type")) {
        return Response.json({
          success: true,
          data: [{ id: "folder_1", relId: "1234567890abcdef1234567890abcdef", name: "空配置资源" }],
        });
      }
      return Response.json({
        success: true,
        data: {
          id: "1234567890abcdef1234567890abcdef",
          name: "空配置资源",
          widgets: [{ id: "widget_1", name: "空图表", datachartId: "chart_1" }],
          datacharts: [{ id: "chart_1", name: "空图表", viewId: "view_1", config: { chartConfig: { datas: [] } } }],
          views: [{ id: "view_1", name: "视图" }],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    const response = await datartDashboardExecute({} as any, adapter as any, {
      dashboardRef: "空配置资源",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });
    const parsed = parseToolResponse(response);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("EXECUTION_FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
