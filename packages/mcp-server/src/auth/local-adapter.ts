import { eq, and, inArray, desc } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { roles, rolePermissions, dataScopeRules, fieldScopeRules } from "../db/schema.js";
import { verifyToken } from "./token.js";
import type { PermissionAdapter, IdentityCredential, DataScopeRule, FieldScopeRule } from "./adapter.js";

export class LocalPermissionAdapter implements PermissionAdapter {
  constructor(private db: Database) {}

  async resolveIdentity(credential: IdentityCredential): Promise<{ userId: number | string; role: string; orgId?: string }> {
    if (credential.type === "direct") {
      return { userId: credential.userId, role: credential.role, orgId: credential.orgId };
    }
    const decoded = verifyToken(credential.token);
    if (!decoded) throw new Error("Invalid or expired token");
    return decoded;
  }

  async getPermissions(roleName: string): Promise<string[]> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    });
    if (!role) throw new Error(`Role '${roleName}' not found`);
    const perms = await this.db.query.rolePermissions.findMany({
      where: eq(rolePermissions.roleId, role.id),
    });
    return perms.map((p) => p.permission);
  }

  async getDataScopeRules(roleName: string, resource: string): Promise<DataScopeRule[]> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    });
    if (!role) throw new Error(`Role '${roleName}' not found in database`);
    const rules = await this.db.query.dataScopeRules.findMany({
      where: and(
        eq(dataScopeRules.roleId, role.id),
        inArray(dataScopeRules.resource, [resource, "*"]),
      ),
      orderBy: desc(dataScopeRules.priority),
    });
    if (rules.length === 0) return [{ scopeType: "deny" }];
    return rules.map((r) => ({
      scopeType: r.scopeType as DataScopeRule["scopeType"],
      ownerField: r.ownerField ?? undefined,
      conditionField: r.conditionField ?? undefined,
      conditionOperator: (r.conditionOperator as DataScopeRule["conditionOperator"]) ?? "eq",
      conditionValue: r.conditionValue ?? undefined,
    }));
  }

  async getFieldScopeRules(roleName: string, resource: string): Promise<FieldScopeRule[]> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    });
    if (!role) return [];
    const rules = await this.db.query.fieldScopeRules.findMany({
      where: and(
        eq(fieldScopeRules.roleId, role.id),
        inArray(fieldScopeRules.resource, [resource, "*"]),
      ),
      orderBy: desc(fieldScopeRules.priority),
    });
    return rules.map((r) => ({
      fieldName: r.fieldName,
      visibility: r.visibility as FieldScopeRule["visibility"],
      maskPattern: r.maskPattern ?? undefined,
    }));
  }
}
