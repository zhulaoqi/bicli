import { formatError, formatSuccess, withAuth } from "../base.js";
import { dateyeRequest } from "../dataeye-proxy.js";
import type { Database } from "../../db/connection.js";
import type { PermissionAdapter } from "../../auth/adapter.js";

type SampleRow = Record<string, unknown>;
type FieldMapping = {
  fieldName: string;
  identifier: string;
  dataType: "1" | "2" | "3";
  primaryKey: boolean;
  remark: string;
};

export async function dataeyeTableImportCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      projectId,
      tableName,
      remark,
      ctType,
      fieldMappings,
      sampleRows,
      sampleText,
      dryRun = true,
    } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");
    if (!tableName) return formatError("INVALID_ARGS", "tableName is required");
    if (!ctType) return formatError("INVALID_ARGS", "ctType is required: 1=日志表, 3=主键表");
    const ctTypeNum = Number(ctType);
    if (ctTypeNum !== 1 && ctTypeNum !== 3) {
      return formatError("INVALID_ARGS", "ctType must be 1 or 3");
    }

    const validateResult = await dateyeRequest<{ exists?: boolean } | boolean>(
      "/api/biDataSource/validateTableName",
      context,
      {
        method: "POST",
        body: { projectId: Number(projectId), tableName: String(tableName) },
      },
    );
    const exists = typeof validateResult === "boolean" ? validateResult : Boolean(validateResult?.exists);
    if (exists) {
      return formatError("TABLE_EXISTS", `表名 "${tableName}" 已存在，请使用其他名称`);
    }

    const rows = Array.isArray(sampleRows)
      ? sampleRows.filter(isRecord) as SampleRow[]
      : parseTabularSample(typeof sampleText === "string" ? sampleText : "");
    const fields = normalizeFieldMappings(fieldMappings, rows);
    if (!fields.length) {
      return formatError("INVALID_ARGS", "无法从样例数据推断字段，请提供 sampleRows、sampleText 或 fieldMappings");
    }

    const preview = {
      dryRun: Boolean(dryRun),
      projectId: Number(projectId),
      tableName: String(tableName),
      remark: remark ? String(remark) : undefined,
      ctType: ctTypeNum,
      fields,
      sampleRowCount: rows.length,
      dataImportStatus: "not_supported",
      dataImportMessage: "当前 MCP 尚未接入文件数据写入接口；本工具可创建表并明确告知数据导入未执行。",
    };

    if (dryRun !== false) {
      return formatSuccess(preview);
    }

    const body: Record<string, unknown> = {
      projectId: Number(projectId),
      tableName: String(tableName),
      ctType: ctTypeNum,
      biDataSourceStructureList: fields.map((field) => ({
        fieldName: field.fieldName,
        identifier: field.identifier,
        dataType: field.dataType,
        primaryKey: field.primaryKey ? 1 : 0,
        remark: field.remark,
      })),
    };
    if (remark) body.remark = String(remark);

    const created = await dateyeRequest("/api/biDataSource/createTable", context, {
      method: "POST",
      body,
    });

    return formatSuccess({
      ...preview,
      dryRun: false,
      created,
      message: `数据表 ${tableName} 已创建；文件数据导入接口尚未接入，因此未上传数据行。`,
    });
  });
}

export function parseTabularSample(sampleText: string): SampleRow[] {
  const lines = sampleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeIdentifier).filter(Boolean);
  if (!headers.length) return [];

  return lines.slice(1, 21).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export function inferDataType(values: unknown[]): "1" | "2" | "3" {
  const samples = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!samples.length) return "2";
  if (samples.every((value) => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(value))) {
    return "1";
  }
  if (samples.every((value) => /^-?\d+(?:\.\d+)?$/.test(value))) {
    return "3";
  }
  return "2";
}

function normalizeFieldMappings(value: unknown, rows: SampleRow[]): FieldMapping[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.filter(isRecord).map((field) => ({
      fieldName: String(field.fieldName ?? field.identifier ?? ""),
      identifier: normalizeIdentifier(String(field.identifier ?? field.fieldName ?? "")),
      dataType: normalizeDataType(field.dataType),
      primaryKey: Boolean(field.primaryKey),
      remark: field.remark ? String(field.remark) : "",
    })).filter((field) => field.fieldName && field.identifier);
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return headers.map((header) => {
    const values = rows.map((row) => row[header]);
    return {
      fieldName: header,
      identifier: normalizeIdentifier(header),
      dataType: inferDataType(values),
      primaryKey: false,
      remark: "",
    };
  });
}

function normalizeDataType(value: unknown): "1" | "2" | "3" {
  return value === "1" || value === "2" || value === "3" ? value : "2";
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      inQuote = !inQuote;
      continue;
    }
    if (char === "," && !inQuote) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const dataeyeTableImportCreateDef = {
  name: "dataeye_table_import_create",
  description: "根据用户上传文件或样例数据创建 DataEye 数据表：推断字段、校验表名、dryRun 预览，确认后建表；如数据导入接口未接入会明确说明未上传数据。",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      fileId: { type: "string", description: "上传文件 ID（预留字段；当前 MCP 尚不能直接读取文件内容，必须同时提供 sampleText 或 sampleRows）" },
      sampleText: { type: "string", description: "CSV/TSV 样例文本，用于字段推断" },
      sampleRows: { type: "array", items: { type: "object" }, description: "样例数据行，用于字段推断" },
      tableName: { type: "string", description: "目标表名（必填）" },
      remark: { type: "string", description: "表说明（可选）" },
      ctType: { type: "number", description: "表类型：1=日志表，3=主键表（必填）" },
      fieldMappings: { type: "array", items: { type: "object" }, description: "用户确认或覆盖后的字段映射" },
      dryRun: { type: "boolean", description: "是否只预览，默认 true；用户确认后传 false", default: true },
      _context: { type: "object" },
    },
    required: ["projectId", "tableName", "ctType", "_context"],
  },
};
