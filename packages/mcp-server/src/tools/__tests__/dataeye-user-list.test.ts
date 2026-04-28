import { describe, expect, it } from "vitest";
import { buildUserListTableResult, extractUserRecords } from "../dataeye-user-list.js";

describe("buildUserListTableResult", () => {
  it("returns summary and a masked table block without raw sensitive values", () => {
    const result = buildUserListTableResult(
      [
        {
          userId: 10001,
          username: "张三",
          email: "zhangsan@example.com",
          phone: "13812340003",
          status: "ACTIVE",
          roleVoList: [
            { roleId: 1, roleName: "管理员" },
            { roleId: 2, roleName: "投放" },
          ],
        },
      ],
      { total: 1, page: 1, pageSize: 20 },
    );

    expect(result.summary).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      shownRows: 1,
    });
    expect(result.__blocks__).toHaveLength(1);
    expect(result.__blocks__[0]).toMatchObject({
      type: "table",
      title: "当前组织用户列表",
      sourceTool: "dataeye_user_list",
      payload: {
        rows: [
          {
            username: "张三",
            email: "zh***@example.com",
            phone: "138****0003",
            status: "ACTIVE",
            roles: "管理员, 投放",
          },
        ],
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("zhangsan@example.com");
    expect(serialized).not.toContain("13812340003");
    expect(serialized).not.toContain("10001");
    expect(serialized).not.toContain("roleId");
  });
});

describe("extractUserRecords", () => {
  it("accepts common paginated list keys without returning the whole response", () => {
    const records = [{ username: "张三" }];

    expect(extractUserRecords({ rows: records, total: 10 })).toEqual({
      records,
      total: 10,
    });
    expect(extractUserRecords({ list: records, count: 3 })).toEqual({
      records,
      total: 3,
    });
  });

  it("falls back to an empty list for unknown response shapes", () => {
    expect(
      extractUserRecords({
        email: "raw@example.com",
        phone: "13812340003",
        userId: 1,
      }),
    ).toEqual({ records: [], total: 0 });
  });
});
