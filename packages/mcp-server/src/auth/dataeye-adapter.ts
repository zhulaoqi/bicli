import type { PermissionAdapter, IdentityCredential, DataScopeRule, FieldScopeRule } from "./adapter.js";

/**
 * dataeye 系统专属权限适配器。
 * 通过 JWT 透传调用 dataeye 后端 API 获取身份和权限信息。
 *
 * dataeye 权限模型：Organization → Role → Permission
 * BiCLI 权限模型：Role → Permission (resource:action)
 *
 * 适配器负责将 dataeye 的 org-scoped 权限映射为 BiCLI 的平面权限格式。
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class DataeyePermissionAdapter implements PermissionAdapter {
  private baseUrl: string;
  private timeout: number;
  private identityCache = new Map<string, CacheEntry<{ userId: string; role: string; orgId?: string }>>();
  private permissionsCache = new Map<string, CacheEntry<string[]>>();
  private readonly identityTTL = 60_000; // 60s
  private readonly permissionsTTL = 300_000; // 5min

  constructor(baseUrl: string, timeout = 5000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
  }

  async resolveIdentity(credential: IdentityCredential): Promise<{ userId: string; role: string; orgId?: string }> {
    if (credential.type === "direct") {
      return {
        userId: String(credential.userId),
        role: credential.role,
        orgId: credential.orgId,
      };
    }

    const now = Date.now();
    const cached = this.identityCache.get(credential.token);
    if (cached && cached.expiresAt > now) return cached.value;

    const data = await this.request<{
      id: string;
      email: string;
      orgId: string;
      roles: Array<{ id: string; name: string; type: string }>;
    }>("/api/bicli/auth/identity", {
      headers: { Authorization: `Bearer ${credential.token}` },
    });

    const primaryRole = data.roles?.[0]?.name || "viewer";
    const identity = {
      userId: data.id,
      role: primaryRole,
      orgId: data.orgId,
    };
    this.identityCache.set(credential.token, {
      value: identity,
      expiresAt: now + this.identityTTL,
    });
    if (this.identityCache.size > 500) this.pruneExpired(this.identityCache);
    return identity;
  }

  async getPermissions(role: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.permissionsCache.get(role);
    if (cached && cached.expiresAt > now) return cached.value;

    let perms: string[];
    try {
      const data = await this.request<string[] | { permissions: string[] }>(
        `/api/bicli/auth/permissions?role=${encodeURIComponent(role)}`,
      );
      perms = Array.isArray(data) ? data : (data.permissions || []);
    } catch {
      perms = this.getDefaultPermissions(role);
    }
    this.permissionsCache.set(role, {
      value: perms,
      expiresAt: now + this.permissionsTTL,
    });
    return perms;
  }

  private pruneExpired<T>(m: Map<string, CacheEntry<T>>): void {
    const now = Date.now();
    for (const [k, v] of m) if (v.expiresAt <= now) m.delete(k);
  }

  async getDataScopeRules(_role: string, _resource: string): Promise<DataScopeRule[]> {
    // dataeye 的数据隔离天然按 orgId 做（JWT 自带）
    // 代理到 dataeye 的业务工具由 dataeye 后端自行隔离
    // BiCLI 内置工具（审计/会话等）按 userId 隔离
    return [{ scopeType: "all" }];
  }

  async getFieldScopeRules(_role: string, _resource: string): Promise<FieldScopeRule[]> {
    return [];
  }

  /**
   * 当 dataeye 权限 API 未部署时的降级策略：按角色名推断权限
   */
  private getDefaultPermissions(role: string): string[] {
    const lowerRole = role.toLowerCase();

    if (lowerRole.includes("admin") || lowerRole.includes("owner") || lowerRole === "管理员") {
      return [
        "user:read", "user:write", "form:read", "form:write",
        "data:read", "config:read", "config:write",
        "role:read", "role:write", "audit:read",
        "approval:read", "approval:write", "approval:review",
        "event:read", "event:write", "table:read", "table:write", "sql:execute",
      ];
    }

    if (lowerRole.includes("editor") || lowerRole.includes("分析") || lowerRole === "编辑") {
      return [
        "user:read", "form:read", "form:write",
        "data:read", "config:read",
        "approval:read", "approval:write",
        "event:read", "table:read", "sql:execute",
      ];
    }

    return ["user:read", "form:read", "data:read", "event:read", "table:read"];
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
        throw new Error(`Dataeye API ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json = await resp.json();
      // dataeye 标准响应格式: { code: 200, data: ..., msg: ... }
      if (json && typeof json === "object" && "data" in json) {
        return json.data as T;
      }
      return json as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Dataeye API timeout (${this.timeout}ms): ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
