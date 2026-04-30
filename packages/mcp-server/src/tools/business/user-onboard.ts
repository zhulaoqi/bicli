import { formatError, formatSuccess, withAuth } from "../base.js";
import { dateyeRequest } from "../dataeye-proxy.js";
import type { Database } from "../../db/connection.js";
import type { PermissionAdapter } from "../../auth/adapter.js";

type UserRecord = {
  userId?: string;
  id?: string;
  email?: string;
  username?: string;
  orgUserName?: string;
  roleVoList?: Array<{ roleId?: string; id?: string; roleName?: string; name?: string }>;
};

type RoleRecord = {
  roleId?: string;
  id?: string;
  roleName?: string;
  name?: string;
};

const PLANNED_ACTIONS = [
  "检查用户是否已存在",
  "校验目标角色",
  "创建用户",
  "绑定角色",
  "验证创建结果",
];

export async function dataeyeUserOnboard(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      email,
      username,
      phone,
      roleIdList,
      roleNameKeywords,
      groupIdList,
      orgAuthFlag,
      dryRun = true,
    } = cleanArgs;

    if (!email) return formatError("INVALID_ARGS", "email 为必填项");
    if (!username) return formatError("INVALID_ARGS", "username 为必填项");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return formatError("INVALID_ARGS", "email 格式不正确");
    }

    const existingUsers = await searchUsersByEmail(String(email), context);
    const duplicate = existingUsers.find((user) => String(user.email || "").toLowerCase() === String(email).toLowerCase());
    if (duplicate) {
      return formatError("USER_EXISTS", `用户邮箱 ${email} 已存在，请改为分配角色或修改用户信息`);
    }

    const roles = await resolveRoles({
      roleIdList: toStringArray(roleIdList),
      roleNameKeywords: toStringArray(roleNameKeywords),
      context,
    });
    if (!roles.ok) return formatError("ROLE_NOT_FOUND", roles.message);

    const preview = {
      dryRun: Boolean(dryRun),
      plannedActions: PLANNED_ACTIONS,
      user: {
        email: String(email),
        username: String(username),
        phone: phone ? String(phone) : undefined,
        orgAuthFlag: Boolean(orgAuthFlag ?? false),
      },
      roles: roles.roles,
      groupIdList: Array.isArray(groupIdList) ? groupIdList : undefined,
      confirmHint: "确认后将创建用户并绑定上述角色。",
    };

    if (dryRun !== false) {
      return formatSuccess(preview);
    }

    const createBody: Record<string, unknown> = {
      email: String(email),
      username: String(username),
      orgAuthFlag: Boolean(orgAuthFlag ?? false),
    };
    if (phone) createBody.phone = String(phone);
    if (roles.roles.length > 0) createBody.roleIdList = roles.roles.map((role) => role.id);
    if (Array.isArray(groupIdList) && groupIdList.length > 0) createBody.groupIdList = groupIdList;

    const created = await dateyeRequest<Record<string, unknown>>("/api/tenant/user/create", context, {
      method: "POST",
      body: createBody,
    });
    const createdUserId = extractUserId(created);
    const verificationUsers = await searchUsersByEmail(String(email), context);
    const verifiedUser = verificationUsers.find((user) => String(user.email || "").toLowerCase() === String(email).toLowerCase());
    const verifiedRoles = verifiedUser ? normalizeUserRoles(verifiedUser) : [];
    const requestedRoleIds = new Set(roles.roles.map((role) => role.id));
    const verifiedRoleIds = new Set(verifiedRoles.map((role) => role.id));
    const roleVerified = requestedRoleIds.size === 0 || [...requestedRoleIds].every((roleId) => verifiedRoleIds.has(roleId));
    const verified = Boolean(verifiedUser) && roleVerified;

    return formatSuccess({
      dryRun: false,
      created,
      createdUserId,
      roles: roles.roles,
      verified,
      roleVerified,
      verifiedUser: verifiedUser
        ? {
            userId: verifiedUser.userId ?? verifiedUser.id,
            email: verifiedUser.email,
            username: verifiedUser.username ?? verifiedUser.orgUserName,
            roles: verifiedRoles,
          }
        : undefined,
      message: verified
        ? `用户「${username}」(${email}) 已创建并完成角色绑定`
        : verifiedUser
          ? `用户「${username}」(${email}) 已创建，但角色绑定验证未通过，请检查角色分配结果`
          : `用户「${username}」(${email}) 已创建，验证查询暂未返回该用户`,
    });
  });
}

async function searchUsersByEmail(email: string, context: any): Promise<UserRecord[]> {
  const data = await dateyeRequest<any>("/api/tenant/user/page", context, {
    method: "POST",
    body: { page: 1, size: 20, keyword: email },
  });
  return extractRecords(data);
}

async function resolveRoles(args: {
  roleIdList: string[];
  roleNameKeywords: string[];
  context: any;
}): Promise<{ ok: true; roles: Array<{ id: string; name: string }> } | { ok: false; message: string }> {
  const desiredIds = new Set(args.roleIdList);
  const desiredKeywords = args.roleNameKeywords.map((keyword) => keyword.toLowerCase());
  if (desiredIds.size === 0 && desiredKeywords.length === 0) {
    return { ok: true, roles: [] };
  }

  const rawRoles = await dateyeRequest<RoleRecord[]>("/api/tenant/role/list/all", args.context);
  const roles = Array.isArray(rawRoles) ? rawRoles : [];
  const matched = roles
    .map((role) => ({
      id: String(role.roleId ?? role.id ?? ""),
      name: String(role.roleName ?? role.name ?? ""),
    }))
    .filter((role) => {
      if (!role.id) return false;
      if (desiredIds.has(role.id)) return true;
      return desiredKeywords.some((keyword) => role.name.toLowerCase().includes(keyword));
    });

  if (matched.length === 0) {
    return { ok: false, message: "未找到匹配的角色，请先查询角色列表并让用户选择" };
  }
  return { ok: true, roles: matched };
}

function extractRecords(data: unknown): UserRecord[] {
  if (Array.isArray(data)) return data as UserRecord[];
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["records", "rows", "list", "dataList", "items"]) {
    if (Array.isArray(record[key])) return record[key] as UserRecord[];
  }
  return [];
}

function extractUserId(data: Record<string, unknown>): string | undefined {
  const nested = data.user && typeof data.user === "object" ? data.user as Record<string, unknown> : undefined;
  const value = data.userId ?? data.id ?? nested?.userId ?? nested?.id;
  return value ? String(value) : undefined;
}

function normalizeUserRoles(user: UserRecord) {
  return (user.roleVoList ?? []).map((role) => ({
    id: String(role.roleId ?? role.id ?? ""),
    name: String(role.roleName ?? role.name ?? ""),
  })).filter((role) => role.id || role.name);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

export const dataeyeUserOnboardDef = {
  name: "dataeye_user_onboard",
  description: "完整新增成员业务动作：检查用户是否存在、校验角色、预览计划、确认后创建用户并绑定角色，再验证结果。",
  inputSchema: {
    type: "object" as const,
    properties: {
      email: { type: "string", description: "用户邮箱（必填，必须是有效邮箱格式）" },
      username: { type: "string", description: "用户显示名称（必填）" },
      phone: { type: "string", description: "手机号（可选）" },
      roleIdList: { type: "array", items: { type: "string" }, description: "要绑定的角色 ID 列表" },
      roleNameKeywords: { type: "array", items: { type: "string" }, description: "角色名称关键词，用于自动匹配角色" },
      groupIdList: { type: "array", items: { type: "number" }, description: "用户组 ID 列表（可选）" },
      orgAuthFlag: { type: "boolean", description: "是否组织管理员，默认 false", default: false },
      dryRun: { type: "boolean", description: "是否只预览计划，默认 true；用户确认后传 false", default: true },
      _context: { type: "object" },
    },
    required: ["email", "username", "_context"],
  },
};
