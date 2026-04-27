import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * 创建组织角色
 * POST /api/tenant/role/create  (@RequestBody RoleCreateParam)

 */
export async function dateyeRoleCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { name, permissionIdList, projectIdList, productIdList } = cleanArgs;

    if (!name) return formatError("INVALID_ARGS", "name（角色名称）为必填项");

    const body: Record<string, unknown> = {
      name: String(name),
      type: "NORMAL",
      resourceList: [],
    };
    if (Array.isArray(permissionIdList) && permissionIdList.length > 0) {
      body.permissionIdList = permissionIdList.map(Number);
    }
    if (Array.isArray(projectIdList) && projectIdList.length > 0) {
      body.projectIdList = projectIdList.map(Number);
    }
    if (Array.isArray(productIdList) && productIdList.length > 0) {
      body.productIdList = productIdList.map(Number);
    }

    const data = await dateyeRequest("/api/tenant/role/create", context, {
      method: "POST",
      body,
    });

    return formatSuccess({ created: data, message: `角色「${name}」已创建成功` });
  });
}

export const dateyeRoleCreateDef = {
  name: "dataeye_role_create",
  description: "在当前组织中创建新角色，可绑定功能权限和项目/产品范围。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "角色名称（必填，组织内唯一）",
      },
      permissionIdList: {
        type: "array",
        items: { type: "number" },
        description: "功能权限 ID 列表（菜单/按钮级权限，可选）",
      },
      projectIdList: {
        type: "array",
        items: { type: "number" },
        description: "可访问的项目 ID 列表，可通过 dataeye_project_list 获取（可选）",
      },
      productIdList: {
        type: "array",
        items: { type: "number" },
        description: "可访问的产品 ID 列表，可通过 dataeye_project_list 获取（可选）",
      },
      _context: { type: "object" },
    },
    required: ["name", "_context"],
  },
};
