import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { getEnabledTools } from "./tool-domain-registry.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { writeAuditLog, buildAuditEntry } from "../middleware/audit.js";

export function registerTools(server: Server, db: Database, adapter: PermissionAdapter) {
  const enableDateye = process.env.PERMISSION_MODE === "dataeye" || !!process.env.DATAEYE_API_URL;
  const enableDatart = !!process.env.DATART_API_URL;
  const allTools = getEnabledTools(process.env);
  if (enableDateye) {
    console.error(`[tools] Dataeye tools enabled (${allTools.filter((tool) => tool.domain === "dataeye").length} tools)`);
  }
  if (enableDatart) {
    console.error(`[tools] Visualization tools enabled (${allTools.filter((tool) => tool.domain === "visualization").length} tools), base: ${process.env.DATART_API_URL}`);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools
      .filter((t) => !t.internal)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || (t.schema ? zodToJsonSchema(t.schema) as any : {}),
        _meta: {
          requiredPermissions: t.requiredPermissions,
          ...(t.destructive ? { destructive: t.destructive } : {}),
        },
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { code: "TOOL_NOT_FOUND", message: `未知工具: ${name}` } }) }],
        isError: true,
      };
    }

    const startTime = Date.now();
    let status: "success" | "failed" = "success";
    let result: any;

    try {
      result = await tool.handler(db, adapter, args || {});
      const text = result?.content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.success === false) status = "failed";
        } catch {}
      }
    } catch (err) {
      status = "failed";
      throw err;
    } finally {
      const entry = buildAuditEntry(name, (args || {}) as Record<string, unknown>, result, status, Date.now() - startTime);
      writeAuditLog(db, entry).catch((err) =>
        console.error("[audit] write failed:", err)
      );
    }

    return result;
  });
}
