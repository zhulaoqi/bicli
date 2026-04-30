import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dataeyeTableImportCreate,
  inferDataType,
  parseTabularSample,
} from "../table-import-create.js";
import { dateyeRequest } from "../../dataeye-proxy.js";

vi.mock("../../dataeye-proxy.js", () => ({
  dateyeRequest: vi.fn(),
}));

const mockedRequest = vi.mocked(dateyeRequest);
const adapter = {
  resolveIdentity: vi.fn(async () => ({ userId: 1, role: "admin", orgId: "org_1" })),
  getPermissions: vi.fn(async () => []),
};

function parseToolResult(result: any) {
  return JSON.parse(result.content[0].text);
}

describe("table import field inference", () => {
  it("parses CSV sample and infers field types", () => {
    const rows = parseTabularSample("event_time,user_id,pay_amount\n2026-04-01,u1,12.5");

    expect(rows).toEqual([{ event_time: "2026-04-01", user_id: "u1", pay_amount: "12.5" }]);
    expect(inferDataType(["2026-04-01"])).toBe("1");
    expect(inferDataType(["u1"])).toBe("2");
    expect(inferDataType(["12.5"])).toBe("3");
  });
});

describe("dataeye_table_import_create", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it("returns dry-run preview with inferred fields and no table create request", async () => {
    mockedRequest.mockResolvedValueOnce({ exists: false });

    const result = await dataeyeTableImportCreate({} as any, adapter as any, {
      projectId: 558,
      tableName: "payment_events",
      ctType: 1,
      sampleText: "event_time,user_id,pay_amount\n2026-04-01,u1,12.5",
      dryRun: true,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.fields).toEqual([
      { fieldName: "event_time", identifier: "event_time", dataType: "1", primaryKey: false, remark: "" },
      { fieldName: "user_id", identifier: "user_id", dataType: "2", primaryKey: false, remark: "" },
      { fieldName: "pay_amount", identifier: "pay_amount", dataType: "3", primaryKey: false, remark: "" },
    ]);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("creates the table after confirmation and honestly reports data import is not supported yet", async () => {
    mockedRequest
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ id: 1001, tableName: "payment_events" });

    const result = await dataeyeTableImportCreate({} as any, adapter as any, {
      projectId: 558,
      tableName: "payment_events",
      ctType: 1,
      sampleRows: [{ event_time: "2026-04-01", user_id: "u1", pay_amount: "12.5" }],
      dryRun: false,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.created).toEqual({ id: 1001, tableName: "payment_events" });
    expect(parsed.data.dataImportStatus).toBe("not_supported");
    expect(parsed.data.uploadedRows).toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith(
      "/api/biDataSource/createTable",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          projectId: 558,
          tableName: "payment_events",
        }),
      }),
    );
  });
});
