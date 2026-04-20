import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class McpHttpClient {
  private client: Client | null = null;
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async connect(): Promise<void> {
    this.client = new Client(
      { name: "bicli-embed", version: "1.0.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.endpoint),
    );
    await this.client.connect(transport);
  }

  async listTools() {
    if (!this.client) throw new Error("MCP client not connected");
    return this.client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>) {
    if (!this.client) throw new Error("MCP client not connected");
    return this.client.callTool({ name, arguments: args });
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
