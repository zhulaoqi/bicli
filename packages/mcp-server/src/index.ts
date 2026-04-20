#!/usr/bin/env node
import "./env.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/connection.js";
import { registerTools } from "./tools/register.js";
import { createPermissionAdapter } from "./auth/create-adapter.js";

async function main() {
  const server = new Server(
    { name: "bicli-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const db = await getDb();
  const adapter = createPermissionAdapter(db);
  registerTools(server, db, adapter);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BiCLI MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start MCP Server:", err);
  process.exit(1);
});
