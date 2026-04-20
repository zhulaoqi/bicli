import { Command } from "commander";
import { McpConnection } from "@bicli/core";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function mcpCommand() {
  const cmd = new Command("mcp")
    .description("Manage MCP Server connection");

  cmd
    .command("status")
    .description("Check MCP Server connection status")
    .action(async () => {
      const mcp = new McpConnection();
      try {
        const mcpServerPath = resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../../mcp-server/src/index.ts"
        );
        await mcp.connect("tsx", [mcpServerPath]);
        const tools = mcp.getTools();
        console.log("MCP Server: ● Connected");
        console.log(`Available tools: ${tools.length}`);
        tools.forEach((t) => console.log(`  - ${t.name}: ${t.description}`));
        await mcp.disconnect();
      } catch (err) {
        console.log("MCP Server: ○ Disconnected");
        console.log(`Error: ${err instanceof Error ? err.message : err}`);
      }
    });

  return cmd;
}
