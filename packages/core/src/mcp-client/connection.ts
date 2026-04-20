import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export class McpConnection {
  private client: Client | null = null;
  private tools: Tool[] = [];

  async connect(command: string, args: string[] = []) {
    this.client = new Client(
      { name: "bicli-cli", version: "1.0.0" },
      { capabilities: {} }
    );

    const transport = new StdioClientTransport({ command, args });
    await this.client.connect(transport);

    const toolsResult = await this.client.listTools();
    this.tools = toolsResult.tools;
  }

  getClient(): Client {
    if (!this.client) throw new Error("MCP Client not connected");
    return this.client;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
