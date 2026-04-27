import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建虚拟事件
 * POST /api/eventManage/event/add (@RequestBody EventAddDto)
 *
 * 注意：此接口创建的是"虚拟事件"（对已采集事件的组合/过滤视图），
 * 不是原始埋点定义。原始埋点由 SDK 上报后自动生成。
 */
export async function dateyeEventCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, eventName, eventAlias, description, eventGroupId, indexInfos } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!eventName) return formatError("INVALID_ARGS", "eventName is required");
    if (!indexInfos || !Array.isArray(indexInfos) || (indexInfos as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "indexInfos is required and must contain at least one base event reference");
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      eventName: String(eventName),
      indexInfos,
    };
    if (eventAlias) body.eventAlias = String(eventAlias);
    if (description) body.description = String(description);
    if (eventGroupId) body.eventGroupId = Number(eventGroupId);

    const data = await dateyeRequest<{ id: number; eventName: string }>(
      "/api/eventManage/event/add", context, { method: "POST", body }
    );

    return formatSuccess(data);
  });
}

export const dateyeEventCreateDef = {
  name: "dataeye_event_create",
  description: "创建虚拟事件（对已采集事件的组合/过滤视图）。注意：原始埋点由 SDK 上报自动生成，无法通过 API 创建。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      eventName: { type: "string", description: "事件英文名（必填）" },
      eventAlias: { type: "string", description: "事件展示名（可选）" },
      description: { type: "string", description: "事件描述（可选）" },
      eventGroupId: { type: "number", description: "所属分组 ID（可选，从 dataeye_event_group_list 获取）" },
      indexInfos: {
        type: "array",
        description: "引用的基础事件列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            eventName: { type: "string" },
            filter: { type: "object" },
          },
          required: ["eventName"],
        },
      },
      _context: { type: "object" },
    },
    required: ["productId", "eventName", "indexInfos", "_context"],
  },
};
