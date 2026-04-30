import { afterEach, describe, expect, it, vi } from "vitest";
import { datartDataExecute } from "../datart-data-execute.js";

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

describe("datartDataExecute", () => {
  it("executes direct view requests with inferred detail columns", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const calls: Array<{ url: string; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({
        success: true,
        data: { columns: [{ name: "order_id" }, { name: "amount" }], rows: [["o1", 100]], pageInfo: { total: 1 } },
      });
    }) as any);

    const response = await datartDataExecute({} as any, adapter as any, {
      viewId: "view_1",
      vizType: "VIEW",
      pageSize: 20,
      view: {
        id: "view_1",
        name: "订单明细",
        meta: [
          { name: "order_id", path: ["order_id"] },
          { name: "amount", path: ["amount"] },
        ],
      },
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResponse(response);
    expect(parsed.success).toBe(true);
    expect(calls[0].body).toMatchObject({
      viewId: "view_1",
      vizType: "VIEW",
      columns: [
        { alias: "order_id", column: ["order_id"] },
        { alias: "amount", column: ["amount"] },
      ],
      pageInfo: { pageNo: 1, pageSize: 20 },
    });
  });

  it("rejects dashboard resources as single chart execution", async () => {
    const response = await datartDataExecute({} as any, adapter as any, {
      viewId: "dashboard_1",
      vizType: "DASHBOARD",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResponse(response);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("INVALID_ARGS");
    expect(parsed.error.message).toContain("dataeye_dashboard_execute");
  });
});
