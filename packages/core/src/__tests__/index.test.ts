import { describe, it, expect } from "vitest";
import { parseSlashCommand, isSlashCommand } from "../slash-commands/parser.js";
import { ModelRegistry } from "../model-registry/index.js";
import { filterToolsByPermission, type ToolWithMeta } from "../permissions/tool-filter.js";

describe("slash-commands/parser", () => {
  it("parses a simple slash command", () => {
    const result = parseSlashCommand("/model");
    expect(result).toEqual({ name: "model", args: [], raw: "/model" });
  });

  it("parses slash command with args", () => {
    const result = parseSlashCommand("/model add");
    expect(result).toEqual({ name: "model", args: ["add"], raw: "/model add" });
  });

  it("returns null for non-slash input", () => {
    expect(parseSlashCommand("hello")).toBeNull();
  });

  it("detects slash commands", () => {
    expect(isSlashCommand("/help")).toBe(true);
    expect(isSlashCommand("hello")).toBe(false);
  });
});

describe("permissions/tool-filter", () => {
  const tools: ToolWithMeta[] = [
    { name: "user_list", _meta: { requiredPermissions: ["user:read"] } },
    { name: "user_manage", _meta: { requiredPermissions: ["user:write"] } },
    { name: "self_permissions", _meta: { requiredPermissions: [] } },
  ];

  it("filters tools by permission", () => {
    const result = filterToolsByPermission(tools, ["user:read"]);
    expect(result.map(t => t.name)).toEqual(["user_list", "self_permissions"]);
  });

  it("allows tools with empty requiredPermissions", () => {
    const result = filterToolsByPermission(tools, []);
    expect(result.map(t => t.name)).toEqual(["self_permissions"]);
  });
});

describe("model-registry", () => {
  it("creates defaults on load", () => {
    const tmpPath = `/tmp/bicli-test-models-${Date.now()}.json`;
    const registry = new ModelRegistry(tmpPath);
    const config = registry.load();
    expect(config.current).toBe("qwen-plus");
    expect(config.models.length).toBeGreaterThanOrEqual(4);
  });
});
