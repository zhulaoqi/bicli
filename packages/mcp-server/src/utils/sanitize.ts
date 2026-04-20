const SENSITIVE_KEYS = new Set([
  "password", "token", "apiKey", "api_key", "secret", "authorization",
]);

export function sanitize(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "_context") continue;
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = "***";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function truncate(obj: unknown, maxLen: number): unknown {
  const str = JSON.stringify(obj);
  if (str.length <= maxLen) return obj;
  return { _truncated: true, preview: str.slice(0, maxLen) + "..." };
}

export function extractAction(toolName: string, input: unknown): string {
  const args =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  if (typeof args.action === "string") return args.action;
  const parts = toolName.split("_");
  return parts[parts.length - 1] || "unknown";
}

export function extractResourceType(toolName: string): string {
  const parts = toolName.split("_");
  return parts[0] || "unknown";
}

export function extractResourceId(
  input: unknown,
  result: unknown,
): string | null {
  const args =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  for (const key of ["id", "userId", "formId", "approvalId", "roleId"]) {
    if (args[key] != null) return String(args[key]);
  }
  const res =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const data =
    res.data && typeof res.data === "object"
      ? (res.data as Record<string, unknown>)
      : {};
  if (data.id != null) return String(data.id);
  return null;
}
