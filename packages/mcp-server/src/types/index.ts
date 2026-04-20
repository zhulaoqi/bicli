export interface ToolContext {
  userId: number;
  role: string;
  token?: string;
  ip?: string;
}

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export type WhereCondition =
  | string
  | number
  | boolean
  | { $in: (string | number)[] }
  | { $like: string }
  | { $gte?: number | string; $lte?: number | string };

export type WhereClause = Record<string, WhereCondition>;

export const TABLE_PERMISSION_MAP: Record<string, string> = {
  users: "user:read",
  forms: "form:read",
  form_fields: "form:read",
  configs: "config:read",
};

export const ALLOWED_DATA_TABLES = ["users", "forms", "form_fields", "configs"] as const;
export type AllowedDataTable = (typeof ALLOWED_DATA_TABLES)[number];
