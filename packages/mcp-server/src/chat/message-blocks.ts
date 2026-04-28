export type MessageBlockType =
  | "table"
  | "chart"
  | "metric_cards"
  | "steps"
  | "timeline"
  | "diagram"
  | "callout"
  | "summary"
  | "warning"
  | "form_request"
  | "confirmation";

export interface MessageBlockBase<TPayload = unknown> {
  id: string;
  type: MessageBlockType | (string & {});
  title?: string;
  sourceTool?: string;
  toolCallId?: string;
  createdAt?: string;
  display?: {
    collapsed?: boolean;
    maxHeight?: number;
    priority?: "primary" | "secondary";
  };
  payload: TPayload;
}

export interface TableColumn {
  key: string;
  title: string;
  dataType?: "string" | "number" | "datetime" | "status" | "email" | "phone" | "id";
  sensitive?: boolean;
  hiddenByDefault?: boolean;
  width?: number;
}

export interface TableBlockPayload {
  columns: TableColumn[];
  rows: Array<Record<string, string | number | boolean | null>>;
  total?: number;
  page?: number;
  pageSize?: number;
  truncated?: boolean;
  masks?: {
    enabled: boolean;
    fields: string[];
  };
  actions?: Array<{
    key: string;
    label: string;
    target?: "row" | "table";
  }>;
}

export interface StepsBlockPayload {
  steps: Array<{
    title: string;
    description?: string;
    status?: "wait" | "process" | "finish" | "error";
  }>;
  orientation?: "vertical" | "horizontal";
}

export type TableMessageBlock = MessageBlockBase<TableBlockPayload> & { type: "table" };
export type ChartMessageBlock = MessageBlockBase & { type: "chart" };
export type StepsMessageBlock = MessageBlockBase<StepsBlockPayload> & { type: "steps" };
export type MessageBlock = TableMessageBlock | ChartMessageBlock | StepsMessageBlock | MessageBlockBase;

export function createBlockId(prefix = "block"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function maskEmail(value: unknown): string {
  const email = String(value ?? "");
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

export function maskPhone(value: unknown): string {
  const phone = String(value ?? "");
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function normalizeTableRows(
  columns: TableColumn[],
  rows: Array<Record<string, unknown>>,
): Array<Record<string, string | number | boolean | null>> {
  return rows.map((row) => {
    const normalized: Record<string, string | number | boolean | null> = {};
    for (const column of columns) {
      if (!Object.prototype.hasOwnProperty.call(row, column.key)) continue;
      const value = toTableCellValue(row[column.key]);
      if (value !== undefined) normalized[column.key] = value;
    }
    return normalized;
  });
}

export function extractMessageBlocksFromToolResult(raw: string): {
  blocks: MessageBlock[];
  resultForLLM: string;
} {
  try {
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed?.data?.__blocks__)
      ? parsed.data.__blocks__.filter(isMessageBlock)
      : [];

    if (blocks.length === 0) {
      return { blocks: [], resultForLLM: raw };
    }

    delete parsed.data.__blocks__;
    return {
      blocks,
      resultForLLM: JSON.stringify(parsed),
    };
  } catch {
    return { blocks: [], resultForLLM: raw };
  }
}

function toTableCellValue(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (item == null) return "";
        if (["string", "number", "boolean"].includes(typeof item)) return String(item);
        if (typeof item === "object") {
          const record = item as Record<string, unknown>;
          return String(record.name ?? record.roleName ?? record.title ?? "");
        }
        return "";
      })
      .filter(Boolean);
    return parts.join(", ");
  }
  return undefined;
}

function isMessageBlock(value: unknown): value is MessageBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Record<string, unknown>;
  return typeof block.id === "string" && typeof block.type === "string" && "payload" in block;
}
