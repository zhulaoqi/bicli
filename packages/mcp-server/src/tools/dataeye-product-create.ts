import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建产品
 * POST /api/tenant/product/create (form params, 无 @RequestBody)
 *
 * 注意：参数通过 query string / form 传递，不是 JSON body
 */
export async function dateyeProductCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, name, pkg } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");
    if (!pkg) return formatError("INVALID_ARGS", "pkg is required (包名/标识符, 如 com.example.app)");

    const params = {
      projectId: Number(projectId),
      name: String(name),
      pkg: String(pkg),
    };

    // form 参数，非 JSON body
    const data = await dateyeRequest("/api/tenant/product/create", context, {
      method: "POST",
      params,
    });

    return formatSuccess(data);
  });
}

export const dateyeProductCreateDef = {
  name: "dataeye_product_create",
  description: "在指定项目下创建新产品。需要提供包名(pkg)作为唯一标识。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      name: { type: "string", description: "产品名称（必填）" },
      pkg: { type: "string", description: "包名/标识符（必填，如 com.example.app）" },
      _context: { type: "object" },
    },
    required: ["projectId", "name", "pkg", "_context"],
  },
};
