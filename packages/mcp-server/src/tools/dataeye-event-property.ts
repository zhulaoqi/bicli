import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件属性查询
 *
 * 分页模式: POST /api/eventManage/event/property/page
 *   → @RequestBody EventManageQueryDto (type + productId 必填)
 *
 * 全量模式: GET /api/eventManage/event/property/nopage
 *   → @RequestParam: id, keyword, type, productId, useVirtual, useJson
 */
export async function dateyeEventProperty(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, type = 1, productEventId, keyword, page = 1, pageSize = 20, useVirtual, useJson } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    if (productEventId) {
      // 分页模式：查指定事件的属性
      const body: Record<string, unknown> = {
        productId: Number(productId),
        type: Number(type),
        page: Number(page),
        size: Number(pageSize),
        id: Number(productEventId),
      };
      if (keyword) body.keyword = String(keyword);

      const data = await dateyeRequest<{
        records: Array<{
          id: number;
          prpId: number;
          propertyAlias: string;
          propertyName: string;
          dataType: string;
          description: string;
          status: number;
        }>;
        total: number;
      }>("/api/eventManage/event/property/page", context, { body });

      return formatSuccess(data.records || data, {
        total: (data as any).total ?? 0,
        page: Number(page),
        pageSize: Number(pageSize),
      });
    }

    // 全量模式：返回产品下所有属性（GET query params）
    const params: Record<string, string | number | undefined> = {
      productId: Number(productId),
    };
    if (keyword) params.keyword = String(keyword);
    if (type !== undefined) params.type = String(type);
    if (useVirtual !== undefined) params.useVirtual = String(useVirtual);
    if (useJson !== undefined) params.useJson = String(useJson);

    const data = await dateyeRequest<Array<{
      id: number;
      propertyName: string;
      description: string;
      propertyType: string;
      dataType: string;
    }>>("/api/eventManage/event/property/nopage", context, { params });

    return formatSuccess(data);
  });
}

export const dateyeEventPropertyDef = {
  name: "dataeye_event_property",
  description: "查询 dataeye 事件属性列表，支持按事件分页查询或查询产品全部属性",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      type: { type: "number", description: "属性类型: 1=事件属性, 2=用户属性, 3=虚拟属性", default: 1 },
      productEventId: { type: "number", description: "product_event_rel.id，指定后查该事件的属性（分页模式）" },
      keyword: { type: "string", description: "搜索关键词" },
      useVirtual: { type: "boolean", description: "是否包含虚拟属性（全量模式）" },
      useJson: { type: "boolean", description: "是否包含 JSON 子属性（全量模式）" },
      page: { type: "number", description: "页码（分页模式）", default: 1 },
      pageSize: { type: "number", description: "每页条数（分页模式，默认20，最多50）", default: 20 },
      _context: { type: "object" },
    },
    required: ["productId", "_context"],
  },
};
