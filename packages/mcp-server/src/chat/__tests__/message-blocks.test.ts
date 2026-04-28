import { describe, expect, it } from "vitest";
import {
  extractMessageBlocksFromToolResult,
  maskEmail,
  maskPhone,
  normalizeTableRows,
  type TableMessageBlock,
} from "../message-blocks.js";

describe("message block helpers", () => {
  it("masks email and phone values before exposing table data", () => {
    expect(maskEmail("zhangsan@example.com")).toBe("zh***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskPhone("13812340003")).toBe("138****0003");
    expect(maskPhone("12345")).toBe("12345");
  });

  it("normalizes table rows by column whitelist and primitive values", () => {
    const rows = normalizeTableRows(
      [
        { key: "username", title: "用户名" },
        { key: "email", title: "邮箱", sensitive: true },
        { key: "roles", title: "角色" },
      ],
      [
        {
          username: "张三",
          email: "zh***@example.com",
          roles: ["管理员", "投放"],
          userId: 123,
          raw: { nested: true },
        },
      ],
    );

    expect(rows).toEqual([
      {
        username: "张三",
        email: "zh***@example.com",
        roles: "管理员, 投放",
      },
    ]);
    expect(rows[0]).not.toHaveProperty("userId");
    expect(rows[0]).not.toHaveProperty("raw");
  });

  it("extracts message blocks from tool result and strips them from LLM payload", () => {
    const block: TableMessageBlock = {
      id: "block_users_1",
      type: "table",
      title: "当前组织用户列表",
      sourceTool: "dataeye_user_list",
      payload: {
        columns: [{ key: "username", title: "用户名" }],
        rows: [{ username: "张三" }],
        total: 1,
      },
    };

    const raw = JSON.stringify({
      success: true,
      data: {
        summary: { total: 1, blockId: block.id },
        __blocks__: [block],
      },
    });

    const extracted = extractMessageBlocksFromToolResult(raw);

    expect(extracted.blocks).toEqual([block]);
    expect(extracted.resultForLLM).toBe(
      JSON.stringify({
        success: true,
        data: {
          summary: { total: 1, blockId: block.id },
        },
      }),
    );
  });
});
