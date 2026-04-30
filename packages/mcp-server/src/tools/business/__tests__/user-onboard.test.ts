import { beforeEach, describe, expect, it, vi } from "vitest";
import { dataeyeUserOnboard } from "../user-onboard.js";
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

describe("dataeye_user_onboard", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it("returns a dry-run onboarding plan without sending write requests", async () => {
    mockedRequest
      .mockResolvedValueOnce({ records: [], total: 0 })
      .mockResolvedValueOnce([{ roleId: "role_1", roleName: "数据分析师" }]);

    const result = await dataeyeUserOnboard({} as any, adapter as any, {
      email: "analyst@example.com",
      username: "Data Analyst",
      roleIdList: ["role_1"],
      dryRun: true,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.plannedActions).toEqual([
      "检查用户是否已存在",
      "校验目标角色",
      "创建用户",
      "绑定角色",
      "验证创建结果",
    ]);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(mockedRequest).not.toHaveBeenCalledWith(
      "/api/tenant/user/create",
      expect.anything(),
      expect.anything(),
    );
  });

  it("stops when the email already exists", async () => {
    mockedRequest.mockResolvedValueOnce({
      records: [{ userId: "u_1", email: "analyst@example.com", username: "Existing Analyst" }],
      total: 1,
    });

    const result = await dataeyeUserOnboard({} as any, adapter as any, {
      email: "analyst@example.com",
      username: "Data Analyst",
      roleIdList: ["role_1"],
      dryRun: false,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error.message).toContain("已存在");
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("creates the user with roles and verifies the result after confirmation", async () => {
    mockedRequest
      .mockResolvedValueOnce({ records: [], total: 0 })
      .mockResolvedValueOnce([{ roleId: "role_1", roleName: "数据分析师" }])
      .mockResolvedValueOnce({ userId: "u_2", id: "u_2" })
      .mockResolvedValueOnce({
        records: [{ userId: "u_2", email: "analyst@example.com", roleVoList: [{ roleId: "role_1", roleName: "数据分析师" }] }],
        total: 1,
      });

    const result = await dataeyeUserOnboard({} as any, adapter as any, {
      email: "analyst@example.com",
      username: "Data Analyst",
      roleIdList: ["role_1"],
      dryRun: false,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.createdUserId).toBe("u_2");
    expect(parsed.data.roles).toEqual([{ id: "role_1", name: "数据分析师" }]);
    expect(parsed.data.verified).toBe(true);
    expect(parsed.data.roleVerified).toBe(true);
    expect(mockedRequest).toHaveBeenCalledWith(
      "/api/tenant/user/create",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          email: "analyst@example.com",
          username: "Data Analyst",
          roleIdList: ["role_1"],
        }),
      }),
    );
  });

  it("reports verification failure when created user does not include requested roles", async () => {
    mockedRequest
      .mockResolvedValueOnce({ records: [], total: 0 })
      .mockResolvedValueOnce([{ roleId: "role_1", roleName: "数据分析师" }])
      .mockResolvedValueOnce({ userId: "u_2", id: "u_2" })
      .mockResolvedValueOnce({
        records: [{ userId: "u_2", email: "analyst@example.com", roleVoList: [] }],
        total: 1,
      });

    const result = await dataeyeUserOnboard({} as any, adapter as any, {
      email: "analyst@example.com",
      username: "Data Analyst",
      roleIdList: ["role_1"],
      dryRun: false,
      _context: { userId: 1, role: "admin", orgId: "org_1", token: "token" },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.verified).toBe(false);
    expect(parsed.data.roleVerified).toBe(false);
    expect(parsed.data.message).toContain("角色绑定验证未通过");
  });
});
