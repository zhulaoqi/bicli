export type NormalizedColumn = {
  key: string;
  title: string;
  dataType: "string" | "number" | "datetime" | "id";
  hiddenByDefault?: boolean;
};

export type NormalizedTable = {
  columns: NormalizedColumn[];
  rows: Array<Record<string, string | number | boolean | null>>;
  total: number;
};

export type MetricCandidate = {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
};

export type DiagnosticItem = {
  label: string;
  message: string;
};

export type ResultProfile =
  | { kind: "empty"; reason?: string }
  | { kind: "metrics"; metrics: MetricCandidate[]; table: NormalizedTable }
  | { kind: "time_series"; xField: string; yFields: string[]; table: NormalizedTable }
  | { kind: "category_chart"; categoryField: string; valueFields: string[]; table: NormalizedTable }
  | { kind: "table"; columns: NormalizedColumn[]; rows: NormalizedTable["rows"]; total: number; truncated?: boolean }
  | { kind: "diagnostic"; severity: "info" | "warning" | "error"; items: DiagnosticItem[] };

type DataframeLike = {
  columns?: Array<{ name?: string; type?: string } | string>;
  rows?: unknown[][];
  pageInfo?: { total?: number };
};

export function profileDataframe(df: DataframeLike | undefined | null): ResultProfile {
  const table = normalizeDataframe(df);
  if (!table.rows.length || !table.columns.length) {
    return { kind: "empty", reason: "结果为空" };
  }

  const numericColumns = table.columns.filter((column) => column.dataType === "number");
  const dateColumn = table.columns.find((column) => column.dataType === "datetime");
  const visibleDimensions = table.columns.filter((column) =>
    column.dataType === "string" && !column.hiddenByDefault,
  );
  const dimensionColumns = table.columns.filter((column) =>
    column.dataType !== "number" && !column.hiddenByDefault,
  );

  if (table.rows.length === 1 && numericColumns.length > 0 && numericColumns.length <= 8) {
    return {
      kind: "metrics",
      metrics: numericColumns.map((column) => ({
        key: column.key,
        label: column.title,
        value: table.rows[0][column.key] as string | number,
        unit: inferUnit(column.key),
      })),
      table,
    };
  }

  if (table.columns.length > 6 || dimensionColumns.length > 3) {
    return {
      kind: "table",
      columns: table.columns,
      rows: table.rows,
      total: table.total,
      truncated: table.rows.length < table.total,
    };
  }

  if (dateColumn && numericColumns.length > 0) {
    return {
      kind: "time_series",
      xField: dateColumn.key,
      yFields: numericColumns.slice(0, 5).map((column) => column.key),
      table,
    };
  }

  if (visibleDimensions.length === 1 && numericColumns.length > 0 && table.rows.length <= 50) {
    return {
      kind: "category_chart",
      categoryField: visibleDimensions[0].key,
      valueFields: numericColumns.slice(0, 3).map((column) => column.key),
      table,
    };
  }

  return {
    kind: "table",
    columns: table.columns,
    rows: table.rows,
    total: table.total,
    truncated: table.rows.length < table.total,
  };
}

export function profileDiagnostics(input: {
  failedResults?: Array<{ unitId?: string; chartName?: string; viewName?: string; error?: string }>;
  skippedUnits?: Array<{ unitId?: string; reason?: string }>;
}): ResultProfile {
  const items: DiagnosticItem[] = [];
  for (const failed of input.failedResults ?? []) {
    items.push({
      label: failed.chartName || failed.viewName || failed.unitId || "执行失败",
      message: failed.error || "执行失败",
    });
  }
  for (const skipped of input.skippedUnits ?? []) {
    items.push({
      label: skipped.unitId || "已跳过组件",
      message: skipped.reason || "组件被跳过",
    });
  }
  return {
    kind: "diagnostic",
    severity: items.length ? "warning" : "info",
    items,
  };
}

export function normalizeDataframe(df: DataframeLike | undefined | null): NormalizedTable {
  const columnKeys = (df?.columns ?? []).map((column, index) =>
    typeof column === "string" ? column : column.name || `column_${index + 1}`,
  );
  const rows = (df?.rows ?? []).map((row) => {
    const record: Record<string, string | number | boolean | null> = {};
    columnKeys.forEach((key, index) => {
      record[key] = toCellValue(row[index]);
    });
    return record;
  });
  const columns = columnKeys.map((key) => ({
    key,
    title: key,
    dataType: inferDataType(key, rows.map((row) => row[key])),
    hiddenByDefault: isLowPriorityIdColumn(key),
  }));

  return {
    columns,
    rows,
    total: df?.pageInfo?.total ?? rows.length,
  };
}

function inferDataType(key: string, values: Array<string | number | boolean | null>): NormalizedColumn["dataType"] {
  if (isLowPriorityIdColumn(key)) return "id";
  if (isDateLikeColumn(key)) return "datetime";
  const nonEmpty = values.filter((value) => value !== null && value !== "");
  if (nonEmpty.length > 0 && nonEmpty.every((value) => typeof value === "number")) return "number";
  return "string";
}

function isLowPriorityIdColumn(key: string): boolean {
  return /(^id$|_id$|Id$|uuid|uid)/.test(key);
}

function isDateLikeColumn(key: string): boolean {
  return /(^hday$|^date$|^day$|^month$|^week$|^time$|date@|_date$|Date$|_day$|_month$|_week$|_time$)/.test(key);
}

function inferUnit(key: string): string | undefined {
  if (/rate|ratio|ctr|cvr/i.test(key)) return "%";
  if (/revenue|cost|amount|price/i.test(key)) return "$";
  return undefined;
}

function toCellValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}
