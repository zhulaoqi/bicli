import { describe, it, expect, vi } from "vitest";
import { ToolCaller } from "../src/llm/tool-caller.js";

function mockClient() {
  return {
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true}' }],
    }),
  } as any;
}

describe("ToolCaller", () => {
  it("injects _context into tool arguments", async () => {
    const client = mockClient();
    const caller = new ToolCaller(client, {
      contextPayload: { userId: 1, role: "admin" },
    });

    await caller.call("user_list", { page: 1 });

    expect(client.callTool).toHaveBeenCalledWith({
      name: "user_list",
      arguments: {
        page: 1,
        _context: { userId: 1, role: "admin" },
      },
    });
  });

  it("supports token-based context", async () => {
    const client = mockClient();
    const caller = new ToolCaller(client, {
      contextPayload: { token: "abc123" },
    });

    await caller.call("self_permissions", {});

    expect(client.callTool).toHaveBeenCalledWith({
      name: "self_permissions",
      arguments: {
        _context: { token: "abc123" },
      },
    });
  });

  it("does not overwrite existing _context in args", async () => {
    const client = mockClient();
    const caller = new ToolCaller(client, {
      contextPayload: { userId: 1, role: "admin" },
    });

    await caller.call("test", { data: "hello", _context: { userId: 999 } });

    expect(client.callTool).toHaveBeenCalledWith({
      name: "test",
      arguments: {
        data: "hello",
        _context: { userId: 1, role: "admin" },
      },
    });
  });

  it("returns the MCP result directly", async () => {
    const client = mockClient();
    const caller = new ToolCaller(client, { contextPayload: { userId: 1, role: "viewer" } });

    const result = await caller.call("data_query", {});
    expect(result.content).toEqual([{ type: "text", text: '{"ok":true}' }]);
  });
});
