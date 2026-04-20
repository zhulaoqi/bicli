import type { PermissionAdapter, IdentityCredential, DataScopeRule, FieldScopeRule } from "./adapter.js";

export class HttpPermissionAdapter implements PermissionAdapter {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout = 5000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
  }

  async resolveIdentity(credential: IdentityCredential): Promise<{ userId: number; role: string }> {
    if (credential.type === "direct") {
      return { userId: credential.userId, role: credential.role };
    }
    const data = await this.request<{ userId: number; role: string }>(
      "/identity",
      { headers: { Authorization: `Bearer ${credential.token}` } },
    );
    if (!data.userId || !data.role) {
      throw new Error("Identity API returned invalid response: missing userId or role");
    }
    return { userId: data.userId, role: data.role };
  }

  async getPermissions(role: string): Promise<string[]> {
    const data = await this.request<string[] | { permissions: string[] }>(
      `/permissions?role=${encodeURIComponent(role)}`,
    );
    return Array.isArray(data) ? data : (data.permissions || []);
  }

  async getDataScopeRules(role: string, resource: string): Promise<DataScopeRule[]> {
    const data = await this.request<DataScopeRule[] | { rules: DataScopeRule[] }>(
      `/data-scope?role=${encodeURIComponent(role)}&resource=${encodeURIComponent(resource)}`,
    );
    const rules = Array.isArray(data) ? data : (data.rules || []);
    if (rules.length === 0) return [{ scopeType: "deny" }];
    return rules;
  }

  async getFieldScopeRules(role: string, resource: string): Promise<FieldScopeRule[]> {
    const data = await this.request<FieldScopeRule[] | { rules: FieldScopeRule[] }>(
      `/field-scope?role=${encodeURIComponent(role)}&resource=${encodeURIComponent(resource)}`,
    );
    return Array.isArray(data) ? data : (data.rules || []);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...init?.headers,
        },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Permission API ${resp.status}: ${text.slice(0, 200)}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Permission API timeout (${this.timeout}ms): ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
