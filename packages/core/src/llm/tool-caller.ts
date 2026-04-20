import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type ContextPayload = Record<string, unknown>;

export interface ToolCallerConfig {
  contextPayload: ContextPayload;
}

export class ToolCaller {
  private client: Client;
  private contextPayload: ContextPayload;

  constructor(client: Client, config: ToolCallerConfig) {
    this.client = client;
    this.contextPayload = config.contextPayload;
  }

  async call(toolName: string, args: Record<string, unknown>) {
    const argsWithContext = {
      ...args,
      _context: this.contextPayload,
    };
    const result = await this.client.callTool({ name: toolName, arguments: argsWithContext });
    return result;
  }
}
