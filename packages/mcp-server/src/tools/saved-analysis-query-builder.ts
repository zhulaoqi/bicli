export type SavedAnalysisType = 1 | 2 | 3;

export type SavedAnalysisDetail = {
  id?: number;
  name?: string;
  type: number;
  projectId?: number;
  project_id?: number;
  productId?: number;
  product_id?: number;
  productIds?: string | null;
  product_ids?: string | null;
  timeCompareType?: number | null;
  time_compare_type?: number | null;
  granularityType?: number | null;
  granularity_type?: number | null;
  timeSpan?: number | null;
  time_span?: number | null;
  timeSpanEnd?: number | null;
  time_span_end?: number | null;
  queryStartTime?: string | null;
  query_start_time?: string | null;
  queryEndTime?: string | null;
  query_end_time?: string | null;
  timeFilterType?: number | null;
  time_filter_type?: number | null;
  timezone?: number | null;
  isDefault?: number | null;
  is_default?: number | null;
  taskId?: number | null;
  prp?: string | null;
  eventAnalysisQuery?: Record<string, unknown> | null;
  funnelAnalysisQueryParam?: Record<string, unknown> | null;
  retentionAnalysisQuery?: Record<string, unknown> | null;
};

export type BuiltSavedAnalysisQuery =
  | {
      ok: true;
      type: SavedAnalysisType;
      endpoint: string;
      body: Record<string, unknown>;
      warnings: string[];
    }
  | {
      ok: false;
      code: "INVALID_SAVED_ANALYSIS_QUERY";
      message: string;
      warnings: string[];
    };

const EXECUTE_ENDPOINT: Record<SavedAnalysisType, string> = {
  1: "/api/my-query-event/report",
  2: "/api/funnel-analysis/report",
  3: "/api/my-query-retention/report",
};

export function getSavedAnalysisEndpoint(type: number): string | undefined {
  return EXECUTE_ENDPOINT[type as SavedAnalysisType];
}

export function buildSavedAnalysisQuery(detail: SavedAnalysisDetail): BuiltSavedAnalysisQuery {
  const endpoint = getSavedAnalysisEndpoint(detail.type);
  if (!endpoint) {
    return invalid(`不支持的分析类型：${detail.type}`, []);
  }

  const typedConfig = parseTypedConfig(detail);
  if (!typedConfig) {
    return invalid(`分析「${detail.name ?? detail.id ?? "unknown"}」的查询参数为空，可能尚未完成配置`, []);
  }

  const body = normalizeNestedProductId({
    ...typedConfig,
    ...readTableFields(detail),
  });

  const validationErrors = validateBuiltQuery(detail.type as SavedAnalysisType, body);
  if (validationErrors.length > 0) {
    return invalid(validationErrors.join("；"), []);
  }

  return {
    ok: true,
    type: detail.type as SavedAnalysisType,
    endpoint,
    body,
    warnings: [],
  };
}

function invalid(message: string, warnings: string[]): BuiltSavedAnalysisQuery {
  return {
    ok: false,
    code: "INVALID_SAVED_ANALYSIS_QUERY",
    message,
    warnings,
  };
}

function parseTypedConfig(detail: SavedAnalysisDetail): Record<string, unknown> | null {
  let typedConfig: Record<string, unknown> | null = null;
  if (detail.type === 1) typedConfig = detail.eventAnalysisQuery ?? null;
  else if (detail.type === 2) typedConfig = detail.funnelAnalysisQueryParam ?? null;
  else if (detail.type === 3) typedConfig = detail.retentionAnalysisQuery ?? null;

  if (!typedConfig) {
    try {
      typedConfig = detail.prp ? JSON.parse(detail.prp) : null;
    } catch {
      typedConfig = null;
    }
  }

  return typedConfig ? cloneRecord(typedConfig) : null;
}

function readTableFields(detail: SavedAnalysisDetail): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  assignIfPresent(fields, "name", detail.name);
  assignIfPresent(fields, "projectId", readField(detail, "projectId", "project_id"));
  assignIfPresent(fields, "productId", readField(detail, "productId", "product_id"));
  assignIfPresent(fields, "productIds", readField(detail, "productIds", "product_ids"));
  assignIfPresent(fields, "timeCompareType", readField(detail, "timeCompareType", "time_compare_type"));
  assignIfPresent(fields, "granularityType", readField(detail, "granularityType", "granularity_type"));
  assignIfPresent(fields, "timeSpan", readField(detail, "timeSpan", "time_span"));
  assignIfPresent(fields, "timeSpanEnd", readField(detail, "timeSpanEnd", "time_span_end"));
  assignIfPresent(fields, "queryStartTime", readField(detail, "queryStartTime", "query_start_time"));
  assignIfPresent(fields, "queryEndTime", readField(detail, "queryEndTime", "query_end_time"));
  assignIfPresent(fields, "timeFilterType", readField(detail, "timeFilterType", "time_filter_type"));
  assignIfPresent(fields, "timezone", detail.timezone);
  assignIfPresent(fields, "isDefault", readField(detail, "isDefault", "is_default"));
  assignIfPresent(fields, "taskId", detail.taskId);
  return fields;
}

function readField<T extends keyof SavedAnalysisDetail>(
  detail: SavedAnalysisDetail,
  camelKey: T,
  snakeKey: T,
): SavedAnalysisDetail[T] | undefined {
  return firstPresent(detail[camelKey], detail[snakeKey]) as SavedAnalysisDetail[T] | undefined;
}

function normalizeNestedProductId(queryParam: Record<string, unknown>): Record<string, unknown> {
  const productId = queryParam.productId;
  if (productId === undefined || productId === null || productId === "") return queryParam;

  const normalized = cloneRecord(queryParam);
  normalized.indexInfos = normalizeArrayWithProductId(normalized.indexInfos, productId);
  normalized.dimensionInfos = normalizeArrayWithProductId(normalized.dimensionInfos, productId);
  normalized.filterInfos = normalizeArrayWithProductId(normalized.filterInfos, productId);
  normalized.firstIndex = normalizeObjectWithProductId(normalized.firstIndex, productId);
  normalized.indexInfo = normalizeObjectWithProductId(normalized.indexInfo, productId);
  normalized.indexInfoChl = normalizeObjectWithProductId(normalized.indexInfoChl, productId);
  normalized.dimensionInfo = normalizeObjectWithProductId(normalized.dimensionInfo, productId);
  normalized.relationProperty = normalizeObjectWithProductId(normalized.relationProperty, productId);

  if (normalized.sameDisplayCustomIndex && typeof normalized.sameDisplayCustomIndex === "object") {
    const sameDisplayCustomIndex = normalized.sameDisplayCustomIndex as Record<string, unknown>;
    sameDisplayCustomIndex.indexInfoChl = normalizeObjectWithProductId(sameDisplayCustomIndex.indexInfoChl, productId);
    normalized.sameDisplayCustomIndex = sameDisplayCustomIndex;
  }

  return normalized;
}

function validateBuiltQuery(type: SavedAnalysisType, body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!hasValue(body.projectId)) errors.push("缺少 projectId");
  if (!hasValue(body.productId)) errors.push("缺少 productId");

  const hasStaticRange = hasValue(body.queryStartTime) && hasValue(body.queryEndTime);
  const hasDynamicRange = hasValue(body.granularityType) && hasValue(body.timeSpan) && hasValue(body.timeSpanEnd);
  if (!hasStaticRange && !hasDynamicRange) {
    errors.push("缺少查询时间范围（queryStartTime/queryEndTime 或 timeSpan/timeSpanEnd/granularityType）");
  }

  if (type === 1 && !hasItems(body.indexInfos)) {
    errors.push("事件分析缺少 indexInfos");
  }
  if (type === 2) {
    const indexInfos = Array.isArray(body.indexInfos) ? body.indexInfos : [];
    if (indexInfos.length < 2) errors.push("漏斗分析至少需要 2 个 indexInfos");
  }
  if (type === 3) {
    if (!isObject(body.firstIndex)) errors.push("留存分析缺少 firstIndex");
    if (!isObject(body.indexInfo)) errors.push("留存分析缺少 indexInfo");
  }

  return errors;
}

function normalizeObjectWithProductId(value: unknown, productId: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = { ...(value as Record<string, unknown>) };
  assignIfPresent(item, "productId", productId);

  if (Array.isArray(item.filters)) {
    item.filters = normalizeArrayWithProductId(item.filters, productId);
  }
  if (Array.isArray(item.dateFilters)) {
    item.dateFilters = normalizeArrayWithProductId(item.dateFilters, productId);
  }
  if (Array.isArray(item.customEvent)) {
    item.customEvent = item.customEvent.map((child) =>
      child && typeof child === "object" ? normalizeObjectWithProductId(child, productId) : child,
    );
  }
  return item;
}

function normalizeArrayWithProductId(value: unknown, productId: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => normalizeObjectWithProductId(item, productId));
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

function firstPresent<T>(...values: Array<T | null | undefined | "">): T | undefined {
  return values.find((value): value is T => value !== undefined && value !== null && value !== "");
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isObject(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
