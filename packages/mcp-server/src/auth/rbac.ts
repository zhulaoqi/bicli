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

  const hasResolvedIdentity =
    (typeof ctx.userId === "number" || typeof ctx.userId === "string") &&
    typeof ctx.role === "string";

  // 优先信任上游 PermissionAdapter 已解析好的身份（带或不带 token）。
  // 这样外部系统（dataeye 等）的 JWT 只用于透传给下游 API，无需 BiCLI 本地验签。
  if (hasResolvedIdentity) {
    return {
      context: {
        userId: ctx.userId as number | string,
        role: ctx.role as string,
        orgId: typeof ctx.orgId === "string" ? ctx.orgId : undefined,
        token: typeof ctx.token === "string" ? ctx.token : undefined,
        ip: typeof ctx.ip === "string" ? ctx.ip : undefined,
      },
      cleanArgs,
    };
  }

  // 退化路径：只收到 BiCLI 本地签发的 token，本地解出身份
  if (typeof ctx.token === "string" && ctx.token) {
    const decoded = verifyToken(ctx.token);
    if (!decoded) throw new Error("Invalid or expired token");
    return {
      context: {
        userId: decoded.userId,
        role: decoded.role,
        orgId: typeof ctx.orgId === "string" ? ctx.orgId : undefined,
        token: ctx.token,
        ip: typeof ctx.ip === "string" ? ctx.ip : undefined,
      },
      cleanArgs,
    };
  }

  throw new Error(
    "Invalid _context: requires userId+role (resolved by adapter) or a BiCLI-signed token",
  );
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
