import { createHash } from "node:crypto";

export interface PermissionScopeInput {
  userId: string | number;
  orgId?: string | null;
  role?: string | null;
  permissions?: string[] | null;
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export function buildPermissionScopeKey(input: PermissionScopeInput): string {
  const permissions = [...(input.permissions ?? [])].map(String).sort();
  const raw = JSON.stringify({
    userId: String(input.userId),
    orgId: input.orgId ?? "",
    role: input.role ?? "",
    permissions,
  });
  return createHash("sha1").update(raw).digest("hex");
}

export function filterHistoryForScope<T extends ChatHistoryMessage>(
  history: T[],
  scope: { sessionScopeKey?: string | null; currentScopeKey: string },
): T[] {
  if (!scope.sessionScopeKey || scope.sessionScopeKey === scope.currentScopeKey) {
    return history;
  }
  return history.filter((m) => m.role === "user");
}
