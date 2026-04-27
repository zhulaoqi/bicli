import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 编辑事件
 * POST /api/eventManage/event/edit (@RequestBody EventEditDto)
 */
export async function dateyeEventUpdate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { eventId, productId, eventAlias, description, eventGroupId } = cleanArgs;

    if (!eventId) return formatError("INVALID_ARGS", "eventId is required");
    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    const body: Record<string, unknown> = {
      eventId: Number(eventId),
      productId: Number(productId),
    };
    if (eventAlias !== undefined) body.eventAlias = String(eventAlias);
    if (description !== undefined) body.description = String(description);
    if (eventGroupId !== undefined) body.eventGroupId = Number(eventGroupId);

    const data = await dateyeRequest("/api/eventManage/event/edit", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventUpdateDef = {
  name: "dataeye_event_update",
  description: "编辑事件的展示名、描述或所属分组。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      eventId: { type: "number", description: "事件 ID（必填）" },
      productId: { type: "number", description: "产品 ID（必填）" },
      eventAlias: { type: "string", description: "新的展示名" },
      description: { type: "string", description: "新的描述" },
      eventGroupId: { type: "number", description: "新的分组 ID" },
      _context: { type: "object" },
    },
    required: ["eventId", "productId", "_context"],
  },
};
