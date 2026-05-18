import { dateyeRequest } from "./dataeye-proxy.js";
import type { ToolContext } from "../types/index.js";

export type DatasourceRow = {
  sourceId: string;
  sourceName: string;
  orgId: string;
  dsType: string;
  dbType: string;
  status: number;
};

export function isNumericDataSourceId(value: unknown): boolean {
  return normalizeNumericSourceId(value) !== null;
}

/** SQL Editor 仅接受纯数字数据源 ID */
export function normalizeNumericSourceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return null;
}

export function looksLikeOpaqueUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return /^[0-9a-f]{32}$/i.test(s.replace(/-/g, "")) || /^[0-9a-f-]{36}$/i.test(s);
}

export type ResolveSqlSourceIdResult =
  | { ok: true; sourceId: number; autoResolved?: boolean; hint?: string }
  | { ok: false; message: string; available?: Array<{ sourceId: string; sourceName: string }> };

/**
 * 解析 SQL 查询用的 sourceId。
 * - 数字 ID：直接使用
 * - 非数字（常见为视图/项目 UUID）：拉取 dataeye_datasource_list，仅一个数据源时自动选用
 */
export async function resolveSqlSourceId(
  raw: unknown,
  context: ToolContext,
): Promise<ResolveSqlSourceIdResult> {
  const numeric = normalizeNumericSourceId(raw);
  if (numeric !== null) {
    return { ok: true, sourceId: numeric };
  }

  let sources: DatasourceRow[] = [];
  try {
    sources = await dateyeRequest<DatasourceRow[]>("/api/bicli/auth/datasources", context);
  } catch {
    return {
      ok: false,
      message:
        `sourceId 必须为纯数字（先调用 dataeye_datasource_list）。当前传入: ${String(raw)}`,
    };
  }

  const available = (sources ?? []).map((s) => ({
    sourceId: s.sourceId,
    sourceName: s.sourceName,
  }));

  if (available.length === 1 && isNumericDataSourceId(available[0].sourceId)) {
    const id = normalizeNumericSourceId(available[0].sourceId)!;
    return {
      ok: true,
      sourceId: id,
      autoResolved: true,
      hint:
        `已将非数字 sourceId「${String(raw)}」自动解析为组织唯一数据源 ${id}（${available[0].sourceName}）。` +
        `后续请使用 dataeye_datasource_list 返回的 sourceId，勿使用视图/项目 UUID。`,
    };
  }

  const sample = available
    .slice(0, 5)
    .map((s) => `${s.sourceId}(${s.sourceName})`)
    .join(", ");

  const uuidHint = looksLikeOpaqueUuid(raw)
    ? " 该值形如视图/项目 UUID，不能用于 SQL Editor。"
    : "";

  return {
    ok: false,
    message:
      `sourceId 必须为纯数字（来自 dataeye_datasource_list），不能是项目/视图/产品 ID。` +
      `当前传入: ${String(raw)}。${uuidHint}` +
      (sample ? ` 可用数据源: ${sample}` : " 请先调用 dataeye_datasource_list。"),
    available,
  };
}
