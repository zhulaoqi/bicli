import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { rolePermissions, roles, users } from "../db/schema.js";
import type { ToolContext } from "../types/index.js";
import { verifyToken } from "./token.js";

export function extractContext(args: Record<string, unknown>): {
  context: ToolContext;
  cleanArgs: Record<string, unknown>;
} {
  const { _context, ...cleanArgs } = args;
  if (!_context || typeof _context !== "object") {
    throw new Error("Missing _context in tool arguments");
  }
  const ctx = _context as Record<string, unknown>;

  if (typeof ctx.token === "string" && ctx.token) {
    const decoded = verifyToken(ctx.token);
    if (!decoded) throw new Error("Invalid or expired token");
    return {
      context: {
        userId: decoded.userId,
        role: decoded.role,
        token: ctx.token,
        ip: typeof ctx.ip === "string" ? ctx.ip : undefined,
      },
      cleanArgs,
    };
  }

  if (typeof ctx.userId !== "number" || typeof ctx.role !== "string") {
    throw new Error("Invalid _context: requires userId (number) and role (string), or token (string)");
  }
  return {
    context: {
      userId: ctx.userId,
      role: ctx.role,
      ip: typeof ctx.ip === "string" ? ctx.ip : undefined,
    },
    cleanArgs,
  };
}

export function checkPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

export function checkPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every((p) => userPermissions.includes(p));
}

export async function getUserPermissions(db: Database, roleId: number): Promise<string[]> {
  const perms = await db.query.rolePermissions.findMany({
    where: eq(rolePermissions.roleId, roleId),
  });
  return perms.map((p) => p.permission);
}

export async function resolveUserPermissions(
  db: Database,
  context: ToolContext
): Promise<string[]> {
  const role = await db.query.roles.findFirst({
    where: eq(roles.name, context.role),
  });
  if (!role) throw new Error(`Role '${context.role}' not found`);
  return getUserPermissions(db, role.id);
}
