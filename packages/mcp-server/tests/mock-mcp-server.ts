#!/usr/bin/env node
/**
 * Minimal mock MCP Server that conforms to the BiCLI MCP Permission Protocol.
 * Used to verify that @bicli/core requires ZERO code changes when swapping MCP implementations.
 *
 * This server has no database — all data is hardcoded.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MOCK_USERS = [
  { id: 1, username: "mock_admin", email: "admin@mock.dev", role: "admin", status: "active" },
  { id: 2, username: "mock_user", email: "user@mock.dev", role: "viewer", status: "active" },
];

const MOCK_PERMISSIONS: Record<string, string[]> = {
  admin: ["user:read", "user:write", "data:read"],
  viewer: ["user:read", "data:read"],
};

function formatSuccess(data: unknown, meta?: { total: number; page: number; pageSize: number }) {
  const resp: Record<string, unknown> = { success: true, data };
  if (meta) resp.meta = meta;
  return { content: [{ type: "text" as const, text: JSON.stringify(resp) }] };
}

async function main() {
  const server = new Server(
    { name: "mock-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "self_permissions",
        description: "获取当前用户权限",
        inputSchema: { type: "object", properties: { _context: { type: "object" } }, required: ["_context"] },
        _meta: { requiredPermissions: [] },
      },
      {
        name: "user_list",
        description: "查询 mock 用户列表",
        inputSchema: { type: "object", properties: {} },
        _meta: { requiredPermissions: ["user:read"] },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const ctx = (args as any)?._context;

    if (name === "self_permissions") {
      const role = ctx?.role || "viewer";
      return formatSuccess({ role, permissions: MOCK_PERMISSIONS[role] || [] });
    }

    if (name === "user_list") {
      return formatSuccess(MOCK_USERS, { total: MOCK_USERS.length, page: 1, pageSize: 20 });
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { code: "TOOL_NOT_FOUND", message: `Unknown tool: ${name}` } }) }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mock MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start Mock MCP Server:", err);
  process.exit(1);
});
