import { describe, it, expect } from "vitest";
import { filterToolsByPermission } from "../src/permissions/tool-filter.js";
import type { ToolWithMeta } from "../src/permissions/tool-filter.js";

function makeTool(name: string, perms?: string[]): ToolWithMeta {
  return {
    name,
    description: `${name} tool`,
    _meta: perms ? { requiredPermissions: perms } : undefined,
  };
}

describe("filterToolsByPermission", () => {
  it("keeps tools with no permission requirements", () => {
    const tools = [makeTool("open_tool")];
    const result = filterToolsByPermission(tools, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("open_tool");
  });

  it("keeps tools when user has all required permissions", () => {
    const tools = [makeTool("user_list", ["user:read"])];
    const result = filterToolsByPermission(tools, ["user:read", "form:read"]);
    expect(result).toHaveLength(1);
  });

  it("filters out tools when user lacks required permissions", () => {
    const tools = [makeTool("user_manage", ["user:write"])];
    const result = filterToolsByPermission(tools, ["user:read"]);
    expect(result).toHaveLength(0);
  });

  it("handles tools with multiple required permissions", () => {
    const tool = makeTool("admin_tool", ["user:write", "role:write"]);
    expect(filterToolsByPermission([tool], ["user:write"])).toHaveLength(0);
    expect(filterToolsByPermission([tool], ["user:write", "role:write"])).toHaveLength(1);
  });

  it("handles empty tool list", () => {
    expect(filterToolsByPermission([], ["user:read"])).toEqual([]);
  });

  it("handles mixed tools with and without permissions", () => {
    const tools = [
      makeTool("open", undefined),
      makeTool("restricted", ["admin:write"]),
      makeTool("readable", ["data:read"]),
    ];
    const result = filterToolsByPermission(tools, ["data:read"]);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(["open", "readable"]);
  });
});
