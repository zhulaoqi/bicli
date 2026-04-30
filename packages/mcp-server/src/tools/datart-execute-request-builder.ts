type ChartDataSectionField = {
  colName?: string;
  aggregate?: string;
  type?: string;
  category?: string;
  expression?: string;
  sort?: { type?: string };
  calculate?: { type?: string; value?: unknown };
  filter?: {
    condition?: {
      operator?: string;
      value?: unknown;
    };
  };
};

type ChartDataSection = {
  type?: string;
  key?: string;
  rows?: ChartDataSectionField[];
};

export type ViewExecuteRequest = Record<string, unknown> & {
  viewId?: unknown;
  vizId?: unknown;
  vizName?: unknown;
  vizType?: unknown;
  columns: Array<Record<string, unknown>>;
  aggregators: Array<Record<string, unknown>>;
  countAggregators: Array<Record<string, unknown>>;
  groups: Array<Record<string, unknown>>;
  filters: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  pageInfo: Record<string, unknown>;
  functionColumns: Array<Record<string, unknown>>;
  calculate: Array<Record<string, unknown>>;
  script: boolean;
};

type BuildResult =
  | { ok: true; request: ViewExecuteRequest }
  | { ok: false; code: "UNSUPPORTED_CHART_CONFIG" | "UNSUPPORTED_VIEW_CONFIG"; message: string };

export type ChartExecuteRequestInput = {
  viewId?: unknown;
  vizId?: unknown;
  vizName?: unknown;
  vizType?: unknown;
  pageSize?: unknown;
  config?: unknown;
  view?: unknown;
  requestBody?: unknown;
  params?: unknown;
};

export type ViewExecuteRequestInput = {
  viewId?: unknown;
  viewName?: unknown;
  pageSize?: unknown;
  view?: unknown;
  params?: unknown;
};

export function buildChartExecuteRequest(input: ChartExecuteRequestInput): BuildResult {
  if (isRecord(input.requestBody)) {
    const request = {
      ...input.requestBody,
      viewId: input.requestBody.viewId ?? input.viewId,
      vizId: input.requestBody.vizId ?? input.vizId,
      vizName: input.requestBody.vizName ?? input.vizName,
      vizType: input.requestBody.vizType ?? input.vizType ?? "DATACHART",
    };
    return { ok: true, request: normalizeRequest(request) };
  }

  const config = parseRecord(input.config);
  const chartConfig = parseRecord(config.chartConfig);
  const datas = asArray<ChartDataSection>(chartConfig.datas ?? config.datas);
  const view = parseRecord(input.view);
  const viewConfig = parseRecord(view.config);
  const fieldPaths = buildFieldPathMap(view);
  const aggregation = config.aggregation !== false;
  const pageSize = Number(input.pageSize ?? 100);
  const request = normalizeRequest({
    ...viewConfig,
    summary: buildSummary(config),
    chartGraphId: config.chartGraphId,
    viewId: input.viewId,
    vizId: input.vizId,
    vizName: input.vizName,
    vizType: input.vizType || "DATACHART",
    columns: buildColumns(datas, aggregation, fieldPaths),
    aggregators: buildAggregators(datas, aggregation, fieldPaths),
    countAggregators: buildCountAggregators(datas, aggregation, fieldPaths),
    groups: buildGroups(datas, aggregation, fieldPaths),
    filters: buildFilters(datas),
    orders: buildOrders(datas, fieldPaths),
    functionColumns: buildFunctionColumns(view, config, datas),
    calculate: buildCalculate(datas),
    pageInfo: { pageNo: 1, pageSize, countTotal: false },
    script: false,
    params: input.params,
  });

  if (isEmptyForService(request)) {
    return {
      ok: false,
      code: "UNSUPPORTED_CHART_CONFIG",
      message: "图表配置无法构造非空 ViewExecuteParam",
    };
  }

  return { ok: true, request };
}

export function buildViewExecuteRequest(input: ViewExecuteRequestInput): BuildResult {
  const view = parseRecord(input.view);
  const viewConfig = parseRecord(view.config);
  const columns = inferViewColumns(view);
  if (!columns.length) {
    return {
      ok: false,
      code: "UNSUPPORTED_VIEW_CONFIG",
      message: "视图缺少可推断的字段元数据，无法构造明细查询",
    };
  }

  return {
    ok: true,
    request: normalizeRequest({
      ...viewConfig,
      viewId: input.viewId || view.id,
      vizName: input.viewName || view.name,
      vizType: "VIEW",
      columns,
      aggregators: [],
      countAggregators: [],
      groups: [],
      filters: [],
      orders: [],
      pageInfo: { pageNo: 1, pageSize: Number(input.pageSize ?? 100), countTotal: false },
      functionColumns: [],
      calculate: [],
      script: false,
      params: input.params,
    }),
  };
}

export function buildChartDataRequestBody(input: ChartExecuteRequestInput): Record<string, unknown> {
  const result = buildChartExecuteRequest(input);
  if (!result.ok) {
    return {
      viewId: input.viewId,
      vizId: input.vizId,
      vizType: input.vizType || "DATACHART",
      pageInfo: { pageNo: 1, pageSize: Number(input.pageSize ?? 100), countTotal: false },
      columns: [],
      aggregators: [],
      countAggregators: [],
      groups: [],
      filters: [],
      orders: [],
      functionColumns: [],
      calculate: [],
      script: false,
    };
  }
  return result.request;
}

function normalizeRequest(value: Record<string, unknown>): ViewExecuteRequest {
  return {
    ...value,
    columns: asArray(value.columns),
    aggregators: asArray(value.aggregators),
    countAggregators: asArray(value.countAggregators),
    groups: asArray(value.groups),
    filters: asArray(value.filters),
    orders: asArray(value.orders),
    pageInfo: isRecord(value.pageInfo) ? value.pageInfo : { pageNo: 1, pageSize: 100, countTotal: false },
    functionColumns: asArray(value.functionColumns),
    calculate: asArray(value.calculate),
    script: value.script === true,
  };
}

function isEmptyForService(request: ViewExecuteRequest): boolean {
  return !request.columns.length && !request.aggregators.length && !request.groups.length;
}

function buildAggregators(
  datas: ChartDataSection[],
  aggregation: boolean,
  fieldPaths: Map<string, string[]>,
): Array<Record<string, unknown>> {
  if (!aggregation) return [];
  return uniqueByColumn(aggregateRows(datas).map((row) => ({
    alias: buildAlias(row),
    column: buildColumnName(row, fieldPaths),
    sqlOperator: row.aggregate,
  })));
}

function buildCountAggregators(
  datas: ChartDataSection[],
  aggregation: boolean,
  fieldPaths: Map<string, string[]>,
): Array<Record<string, unknown>> {
  if (!aggregation) return [];
  return uniqueByColumn(aggregateRows(datas).map((row) => ({
    alias: String(row.colName),
    column: buildColumnName(row, fieldPaths),
    sqlOperator: row.aggregate,
  })));
}

function aggregateRows(datas: ChartDataSection[]): ChartDataSectionField[] {
  return datas
    .flatMap((section) => {
      if (["aggregate", "size", "info"].includes(String(section.type))) return section.rows ?? [];
      if (section.type === "mixed") return (section.rows ?? []).filter((row) => row.type === "NUMERIC");
      return [];
    })
    .filter((row) => row.colName);
}

function buildGroups(
  datas: ChartDataSection[],
  aggregation: boolean,
  fieldPaths: Map<string, string[]>,
): Array<Record<string, unknown>> {
  if (!aggregation) return [];
  return uniqueByColumn(
    datas
      .flatMap((section) => {
        if (["group", "color"].includes(String(section.type))) return section.rows ?? [];
        if (section.type === "mixed") return (section.rows ?? []).filter((row) => ["DATE", "STRING"].includes(String(row.type)));
        return [];
      })
      .filter((row) => row.colName)
      .map((row) => ({
        alias: buildAlias(row),
        column: buildColumnName(row, fieldPaths),
      })),
  );
}

function buildColumns(
  datas: ChartDataSection[],
  aggregation: boolean,
  fieldPaths: Map<string, string[]>,
): Array<Record<string, unknown>> {
  if (aggregation) return [];
  return uniqueByColumn(
    datas
      .flatMap((section) => {
        if (["color", "aggregate", "size", "info", "mixed", "group"].includes(String(section.type))) return section.rows ?? [];
        return [];
      })
      .filter((row) => row.colName && row.category !== "aggregateComputedField")
      .map((row) => ({
        alias: buildAlias(row),
        column: buildColumnName(row, fieldPaths),
      })),
  );
}

function buildFilters(datas: ChartDataSection[]): Array<Record<string, unknown>> {
  return datas
    .filter((section) => section.type === "filter")
    .flatMap((section) => section.rows ?? [])
    .filter((row) => row.colName && row.filter?.condition?.operator)
    .map((row) => ({
      column: buildColumnName(row),
      sqlOperator: row.filter?.condition?.operator,
      values: normalizeFilterValues(row.filter?.condition?.value, row.type),
    }));
}

function buildOrders(datas: ChartDataSection[], fieldPaths: Map<string, string[]>): Array<Record<string, unknown>> {
  return datas
    .flatMap((section) => section.rows ?? [])
    .filter((row) => row.colName && row.sort?.type)
    .map((row) => ({
      column: buildColumnName(row, fieldPaths),
      operator: row.sort?.type,
      aggOperator: row.aggregate,
    }));
}

function buildCalculate(datas: ChartDataSection[]): Array<Record<string, unknown>> {
  return datas
    .flatMap((section) => section.rows ?? [])
    .filter((row) => row.colName && row.calculate?.type && row.calculate.value !== undefined)
    .map((row) => ({
      column: buildColumnName(row),
      type: row.calculate?.type,
      value: row.calculate?.value,
    }));
}

function buildFunctionColumns(
  view: Record<string, unknown>,
  config: Record<string, unknown>,
  datas: ChartDataSection[],
): Array<Record<string, unknown>> {
  const usedColumns = new Set(datas.flatMap((section) => section.rows ?? []).map((row) => row.colName).filter(Boolean));
  const rowComputedFields = datas
    .flatMap((section) => section.rows ?? [])
    .filter((row) => row.colName && row.expression)
    .map((row) => ({
      name: row.colName,
      category: row.category,
      expression: row.expression,
    }));
  const computedFields = [
    ...asArray<Record<string, unknown>>(view.computedFields),
    ...asArray<Record<string, unknown>>(config.computedFields),
    ...rowComputedFields,
  ];
  return uniqueByAlias(computedFields
    .filter((field) => typeof field.name === "string" && usedColumns.has(field.name))
    .map((field) => ({
      alias: field.name,
      category: field.category,
      snippet: field.expression,
    })));
}

function buildSummary(config: Record<string, unknown>): Record<string, unknown> {
  const styles = asArray<Record<string, unknown>>(config.styles);
  const summaryStyle = styles.find((style) => style.key === "summary");
  const computedRow = asArray<Record<string, unknown>>(summaryStyle?.rows)
    .find((row) => row.key === "computed");
  const value = parseRecord(computedRow?.value);
  return {
    enable: value.enable === true,
    method: value.method,
  };
}

function inferViewColumns(view: Record<string, unknown>): Array<Record<string, unknown>> {
  const meta = asArray<Record<string, unknown>>(view.meta);
  const fields = meta.length ? meta : asArray<Record<string, unknown>>(view.model);
  return fields.reduce<Array<Record<string, unknown>>>((acc, field) => {
    const name = typeof field.name === "string" ? field.name : undefined;
    const path = asArray<string>(field.path);
    const column = path.length ? path : name ? [name] : [];
    if (name && column.length) acc.push({ alias: name, column });
    return acc;
  }, []);
}

function normalizeFilterValues(value: unknown, valueType?: string): Array<Record<string, unknown>> {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item) => item !== undefined && item !== null)
    .map((item) => isRecord(item) && "value" in item
      ? item
      : { value: item, valueType });
}

function buildAlias(row: ChartDataSectionField): string {
  if (!row.aggregate || row.aggregate === "NONE") return String(row.colName);
  return `${row.aggregate}(${row.colName})`;
}

function buildColumnName(row: ChartDataSectionField, fieldPaths = new Map<string, string[]>()): string[] {
  const colName = String(row.colName);
  return fieldPaths.get(colName) ?? colName.split(".").filter(Boolean);
}

function buildFieldPathMap(view: Record<string, unknown>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const field of asArray<Record<string, unknown>>(view.meta)) {
    if (typeof field.name !== "string") continue;
    const path = asArray<string>(field.path);
    if (path.length) map.set(field.name, path);
  }
  return map;
}

function uniqueByColumn(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify([item.column, item.sqlOperator]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueByAlias(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    if (seen.has(item.alias)) return false;
    seen.add(item.alias);
    return true;
  });
}

export function parseRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
