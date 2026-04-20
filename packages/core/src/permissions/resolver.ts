import type { McpConnection } from "../mcp-client/connection.js";

const REFRESH_INTERVAL = 5 * 60 * 1000;

export class PermissionResolver {
  private mcp: McpConnection;
  private userId: number;
  private role: string;
  private contextPayload?: Record<string, unknown>;
  private permissions: string[] = [];
  private timer?: ReturnType<typeof setInterval>;

  constructor(mcp: McpConnection, userId: number, role: string, contextPayload?: Record<string, unknown>) {
    this.mcp = mcp;
    this.userId = userId;
    this.role = role;
    this.contextPayload = contextPayload;
  }

  async initialize(): Promise<string[]> {
    this.permissions = await this.fetchPermissions();
    this.timer = setInterval(async () => {
      try {
        this.permissions = await this.fetchPermissions();
      } catch {
        // keep old permissions on refresh failure
      }
    }, REFRESH_INTERVAL);
    return this.permissions;
  }

  async refresh(): Promise<string[]> {
    this.permissions = await this.fetchPermissions();
    return this.permissions;
  }

  getPermissions(): string[] {
    return [...this.permissions];
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async fetchPermissions(): Promise<string[]> {
    const client = this.mcp.getClient();
    const ctx = this.contextPayload ?? { userId: this.userId, role: this.role };
    const result = await client.callTool({
      name: "self_permissions",
      arguments: { _context: ctx },
    });
    const text = (result.content as any[])?.[0]?.text || "{}";
    const parsed = JSON.parse(text);
    if (parsed.success && parsed.data?.permissions) {
      return parsed.data.permissions;
    }
    return [];
  }
}
