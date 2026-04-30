import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnabledTools } from "../tool-domain-registry.js";
import { datartScheduleCreate } from "../datart-schedule-create.js";
import { datartScheduleDetail } from "../datart-schedule-detail.js";
import { datartScheduleLogs } from "../datart-schedule-logs.js";
import { datartScheduleUpdate } from "../datart-schedule-update.js";
import { dataeyeScheduleManage } from "../business/schedule-manage.js";

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

describe("Datart schedule MCP tools", () => {
  it("registers schedule management tools in visualization domain", () => {
    const names = getEnabledTools({ DATART_API_URL: "https://viz.example.test" }).map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      "dataeye_schedule_manage",
      "dataeye_schedule_detail",
      "dataeye_schedule_logs",
      "dataeye_schedule_update",
      "dataeye_schedule_delete",
      "dataeye_schedule_copy",
      "dataeye_schedule_name_check",
      "dataeye_schedule_archived_list",
      "dataeye_schedule_unarchive",
    ]));
  });

  it("creates schedules with backend-compatible config body", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const calls: Array<{ url: string; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({
        success: true,
        data: { id: "schedule_1", name: "日报", type: "EMAIL", cronExpression: "0 0 9 * * ?" },
      });
    }) as any);

    const response = await datartScheduleCreate({} as any, adapter as any, {
      name: "日报",
      type: "EMAIL",
      cronExpression: "0 0 9 * * ?",
      recipients: ["a@example.com"],
      subject: "日报",
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
      attachments: ["IMAGE"],
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResponse(response);
    expect(parsed.success).toBe(true);
    expect(calls[0].url).toContain("/api/v1/schedules");
    expect(JSON.parse(calls[0].body.config)).toMatchObject({
      to: "a@example.com",
      subject: "日报",
      attachments: ["IMAGE"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
    });
  });

  it("fetches details and logs through authenticated schedule APIs", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/logs/")) {
        return Response.json({ success: true, data: [{ scheduleId: "schedule_1", status: 1, message: "SUCCESS" }] });
      }
      return Response.json({
        success: true,
        data: { id: "schedule_1", name: "日报", config: "{\"webHookUrl\":\"https://secret\"}" },
      });
    }) as any);

    const detail = parseToolResponse(await datartScheduleDetail({} as any, adapter as any, {
      scheduleId: "schedule_1",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    }));
    const logs = parseToolResponse(await datartScheduleLogs({} as any, adapter as any, {
      scheduleId: "schedule_1",
      count: 5,
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    }));

    expect(detail.data.schedule.config.webHookUrl).toBe("***REDACTED***");
    expect(logs.data.logs[0].message).toBe("SUCCESS");
    expect(urls.some((url) => url.includes("/logsV2/"))).toBe(false);
    expect(urls.some((url) => url.includes("/executeV2/"))).toBe(false);
  });

  it("updates schedule config by merging current detail first", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const calls: Array<{ url: string; method?: string; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === "PUT") return Response.json({ success: true, data: true });
      return Response.json({
        success: true,
        data: {
          id: "schedule_1",
          name: "日报",
          orgId: "org_1",
          type: "EMAIL",
          cronExpression: "0 0 9 * * ?",
          timezone: "Asia/Shanghai",
          isFolder: false,
          config: JSON.stringify({
            to: "old@example.com",
            subject: "旧主题",
            attachments: ["IMAGE"],
            vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
          }),
        },
      });
    }) as any);

    const parsed = parseToolResponse(await datartScheduleUpdate({} as any, adapter as any, {
      scheduleId: "schedule_1",
      recipients: ["new@example.com"],
      subject: "新主题",
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    }));

    const updateCall = calls.find((call) => call.method === "PUT");
    expect(parsed.success).toBe(true);
    expect(updateCall?.url).toContain("/api/v1/schedules/schedule_1");
    expect(JSON.parse(updateCall?.body.config)).toMatchObject({
      to: "new@example.com",
      subject: "新主题",
      attachments: ["IMAGE"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
    });
  });

  it("returns dry-run schedule changes without writing", async () => {
    vi.stubEnv("DATART_API_URL", "https://viz.example.com");
    const fetchMock = vi.fn(async () => Response.json({
      success: true,
      data: {
        id: "schedule_1",
        name: "日报",
        type: "EMAIL",
        cronExpression: "0 0 9 * * ?",
        timezone: "Asia/Shanghai",
        active: false,
        config: JSON.stringify({ to: "old@example.com", subject: "旧主题" }),
      },
    }));
    vi.stubGlobal("fetch", fetchMock as any);

    const parsed = parseToolResponse(await dataeyeScheduleManage({} as any, adapter as any, {
      operation: "update",
      scheduleId: "schedule_1",
      recipients: ["new@example.com"],
      subject: "新主题",
      dryRun: true,
      _context: { userId: "u1", role: "admin", orgId: "org_1", token: "token" },
    }));

    expect(parsed.success).toBe(true);
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.changes).toEqual(expect.arrayContaining([
      expect.stringContaining("收件人"),
      expect.stringContaining("主题"),
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
