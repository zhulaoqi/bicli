import { eq, and, or, inArray, ne, desc, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { dataScopeRules, fieldScopeRules, roles } from "../db/schema.js";
import type { ToolContext } from "../types/index.js";

export interface DataScopeRule {
  scopeType: "all" | "own" | "condition" | "deny";
  ownerField?: string;
  conditionField?: string;
  conditionOperator?: "eq" | "in" | "ne";
  conditionValue?: unknown;
}

export async function getDataScopeRules(
  db: Database,
  roleName: string,
  resource: string
): Promise<DataScopeRule[]> {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
  if (!role) throw new Error(`Role '${roleName}' not found in database`);

  const rules = await db.query.dataScopeRules.findMany({
    where: and(
      eq(dataScopeRules.roleId, role.id),
      inArray(dataScopeRules.resource, [resource, "*"]),
    ),
    orderBy: desc(dataScopeRules.priority),
  });

  if (rules.length === 0) return [{ scopeType: "deny" }];
  return rules.map(r => ({
    scopeType: r.scopeType as DataScopeRule["scopeType"],
    ownerField: r.ownerField ?? undefined,
    conditionField: r.conditionField ?? undefined,
    conditionOperator: (r.conditionOperator as DataScopeRule["conditionOperator"]) ?? "eq",
    conditionValue: r.conditionValue ?? undefined,
  }));
}

function resolveColumn(tableRef: any, fieldName: string) {
  if (tableRef[fieldName]) return tableRef[fieldName];
  const camel = fieldName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  if (tableRef[camel]) return tableRef[camel];
  const snake = fieldName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  if (tableRef[snake]) return tableRef[snake];
  return undefined;
}

export function applyDataScope(
  rules: DataScopeRule[],
  context: ToolContext,
  tableRef: any,
  conditions: SQL[]
): SQL[] {
  const rule = rules[0];
  if (!rule || rule.scopeType === "all") return conditions;
  if (rule.scopeType === "deny") {
    conditions.push(sql`1 = 0`);
    return conditions;
  }
  if (rule.scopeType === "own" && rule.ownerField) {
    const fields = rule.ownerField.split(",");
    const orConditions = fields
      .map((f) => resolveColumn(tableRef, f.trim()))
      .filter(Boolean)
      .map((col) => eq(col!, context.userId));
    if (orConditions.length === 1) {
      conditions.push(orConditions[0]);
    } else if (orConditions.length > 1) {
      conditions.push(or(...orConditions)!);
    }
  }
  if (rule.scopeType === "condition" && rule.conditionField) {
    const column = resolveColumn(tableRef, rule.conditionField);
    if (!column) return conditions;
    switch (rule.conditionOperator) {
      case "eq":
        conditions.push(eq(column, rule.conditionValue));
        break;
      case "in":
        conditions.push(inArray(column, rule.conditionValue as any[]));
        break;
      case "ne":
        conditions.push(ne(column, rule.conditionValue));
        break;
    }
  }
  return conditions;
}

// --- Field-Level Scope ---

export interface FieldScopeRule {
  fieldName: string;
  visibility: "visible" | "hidden" | "masked";
  maskPattern?: string;
}

export async function getFieldScopeRules(
  db: Database,
  roleName: string,
  resource: string
): Promise<FieldScopeRule[]> {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
  if (!role) return [];

  const rules = await db.query.fieldScopeRules.findMany({
    where: and(
      eq(fieldScopeRules.roleId, role.id),
      inArray(fieldScopeRules.resource, [resource, "*"]),
    ),
    orderBy: desc(fieldScopeRules.priority),
  });

  return rules.map(r => ({
    fieldName: r.fieldName,
    visibility: r.visibility as FieldScopeRule["visibility"],
    maskPattern: r.maskPattern ?? undefined,
  }));
}

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

function maskPhone(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 3) + "****" + value.slice(-4);
}

function maskDefault(value: string): string {
  if (value.length <= 2) return "**";
  return value[0] + "*".repeat(value.length - 2) + value[value.length - 1];
}

function maskValue(value: string, pattern?: string): string {
  switch (pattern) {
    case "email": return maskEmail(value);
    case "phone": return maskPhone(value);
    default: return maskDefault(value);
  }
}

export function applyFieldScopeWithRules(
  rules: FieldScopeRule[],
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (rules.length === 0) return rows;
  return rows.map(row => {
    const filtered = { ...row };
    for (const rule of rules) {
      if (rule.visibility === "hidden") {
        delete filtered[rule.fieldName];
      } else if (rule.visibility === "masked" && filtered[rule.fieldName] != null) {
        filtered[rule.fieldName] = maskValue(
          String(filtered[rule.fieldName]),
          rule.maskPattern,
        );
      }
    }
    return filtered;
  });
}

/** @deprecated Use adapter.getFieldScopeRules + applyFieldScopeWithRules */
export async function applyFieldScope(
  db: Database,
  roleName: string,
  resource: string,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const rules = await getFieldScopeRules(db, roleName, resource);
  return applyFieldScopeWithRules(rules, rows);
}
