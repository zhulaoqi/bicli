import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 保存自定义事件属性
 * POST /api/eventManage/event/property/customize/saveOrUpdate
 * (@RequestBody EventPropertySaveDto)
 *
 * saveType: 1=事件属性, 3=用户属性
 * productEventIds: 关联的事件 ID 列表（从事件创建返回的 id 获取）
 */
export async function dateyeEventPropertySave(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, propertyName, propertyAlias, dataType, description, saveType, productEventIds } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!propertyName) return formatError("INVALID_ARGS", "propertyName is required");
    if (!dataType) return formatError("INVALID_ARGS", "dataType is required (string/number/datetime/boolean/list)");
    if (saveType === undefined || saveType === null) {
      return formatError("INVALID_ARGS", "saveType is required: 1=事件属性, 3=用户属性");
    }

    const saveTypeNum = Number(saveType);
    if (saveTypeNum !== 1 && saveTypeNum !== 3) {
      return formatError("INVALID_ARGS", "saveType must be 1 (事件属性) or 3 (用户属性)");
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      propertyName: String(propertyName),
      dataType: String(dataType),
      saveType: saveTypeNum,
    };
    if (propertyAlias) body.propertyAlias = String(propertyAlias);
    if (description) body.description = String(description);
    if (productEventIds && Array.isArray(productEventIds)) {
      body.productEventIds = (productEventIds as unknown[]).map(Number);
    }

    const data = await dateyeRequest(
      "/api/eventManage/event/property/customize/saveOrUpdate",
      context,
      { method: "POST", body }
    );

    return formatSuccess(data);
  });
}

export const dateyeEventPropertySaveDef = {
  name: "dataeye_event_property_save",
  description: "新增或更新自定义事件/用户属性。saveType=1 为事件属性，saveType=3 为用户属性。创建后可通过 productEventIds 关联到具体事件。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      propertyName: { type: "string", description: "属性英文名（必填）" },
      propertyAlias: { type: "string", description: "属性展示名（可选）" },
      dataType: { type: "string", description: "数据类型：string/number/datetime/boolean/list（必填）" },
      saveType: { type: "number", description: "属性类型：1=事件属性，3=用户属性（必填）" },
      description: { type: "string", description: "属性描述（可选）" },
      productEventIds: {
        type: "array",
        description: "关联的事件 ID 列表（可选，从 dataeye_event_create 返回的 id 获取）",
        items: { type: "number" },
      },
      _context: { type: "object" },
    },
    required: ["productId", "propertyName", "dataType", "saveType", "_context"],
  },
};
