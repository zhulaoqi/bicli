import { describe, expect, it } from "vitest";
import { buildPermissionScopeKey, filterHistoryForScope } from "../history-scope.js";

describe("history permission scope", () => {
  it("builds a stable key independent of permission order", () => {
    const a = buildPermissionScopeKey({
      userId: 1,
      orgId: "org1",
      role: "analyst",
      permissions: ["b", "a"],
    });
    const b = buildPermissionScopeKey({
      userId: 1,
      orgId: "org1",
      role: "analyst",
      permissions: ["a", "b"],
    });

    expect(a).toBe(b);
  });

  it("keeps only user messages when session scope changed", () => {
    const history = [
      { role: "user" as const, content: "查 cgt 产品" },
      { role: "assistant" as const, content: "cgt 下有产品 A" },
      { role: "user" as const, content: "再查 wgt 产品" },
    ];

    expect(filterHistoryForScope(history, {
      sessionScopeKey: "old",
      currentScopeKey: "new",
    })).toEqual([
      { role: "user", content: "查 cgt 产品" },
      { role: "user", content: "再查 wgt 产品" },
    ]);
  });

  it("preserves history when session scope is current", () => {
    const history = [
      { role: "user" as const, content: "查项目" },
      { role: "assistant" as const, content: "已调用工具得到项目 A" },
    ];

    expect(filterHistoryForScope(history, {
      sessionScopeKey: "same",
      currentScopeKey: "same",
    })).toEqual(history);
  });
});
