import type { ToolContext } from "../types/index.js";
import { datartRequest } from "./datart-proxy.js";

type FolderItem = {
  id: string;
  name: string;
  relId?: string;
  rel_id?: string;
  parentId?: string;
  parent_id?: string;
};

export type ResourceCandidate = {
  id: string;
  name: string;
  folderId?: string;
  parentId?: string;
};

export type ResolveDashboardResult =
  | { resolved: true; matchedBy: "id" | "name" | "prefix"; resource: ResourceCandidate }
  | {
      resolved: false;
      code: "AMBIGUOUS_RESOURCE" | "NOT_FOUND";
      message: string;
      candidates?: ResourceCandidate[];
    };

export function normalizeDashboardCandidates(items: FolderItem[] = []): ResourceCandidate[] {
  return items.reduce<ResourceCandidate[]>((acc, item) => {
    const id = item.relId || item.rel_id;
    if (!id || !item.name) return acc;
    acc.push({
        id,
        name: item.name,
        folderId: item.id,
        parentId: item.parentId || item.parent_id,
    });
    return acc;
  }, []);
}

export function resolveDashboardRefFromCandidates(
  dashboardRef: string | undefined,
  candidates: ResourceCandidate[],
): ResolveDashboardResult {
  const ref = dashboardRef?.trim();
  if (!ref) {
    return {
      resolved: false,
      code: "NOT_FOUND",
      message: "请提供看板名称或真实看板 ID",
    };
  }

  const exactId = candidates.find((candidate) => candidate.id === ref);
  if (exactId) return { resolved: true, matchedBy: "id", resource: exactId };

  const exactNameMatches = candidates.filter((candidate) => candidate.name === ref);
  if (exactNameMatches.length === 1) return { resolved: true, matchedBy: "name", resource: exactNameMatches[0] };
  if (exactNameMatches.length > 1) {
    return {
      resolved: false,
      code: "AMBIGUOUS_RESOURCE",
      message: `找到 ${exactNameMatches.length} 个同名看板，请选择完整 ID`,
      candidates: exactNameMatches,
    };
  }

  const lowerRef = ref.toLowerCase();
  const caseInsensitiveNameMatches = candidates.filter((candidate) => candidate.name.toLowerCase() === lowerRef);
  if (caseInsensitiveNameMatches.length === 1) return { resolved: true, matchedBy: "name", resource: caseInsensitiveNameMatches[0] };
  if (caseInsensitiveNameMatches.length > 1) {
    return {
      resolved: false,
      code: "AMBIGUOUS_RESOURCE",
      message: `找到 ${caseInsensitiveNameMatches.length} 个同名看板，请选择完整 ID`,
      candidates: caseInsensitiveNameMatches,
    };
  }

  const prefixMatches = candidates.filter((candidate) => candidate.id.startsWith(ref));
  if (prefixMatches.length === 1) {
    return { resolved: true, matchedBy: "prefix", resource: prefixMatches[0] };
  }
  if (prefixMatches.length > 1) {
    return {
      resolved: false,
      code: "AMBIGUOUS_RESOURCE",
      message: `找到 ${prefixMatches.length} 个匹配的看板，请选择完整名称或完整 ID`,
      candidates: prefixMatches,
    };
  }

  return {
    resolved: false,
    code: "NOT_FOUND",
    message: `未找到匹配的看板：${ref}。请确认传入的是看板名称或 Folder.relId，而不是 folderId`,
  };
}

export async function resolveDashboardRef(
  context: ToolContext,
  input: { dashboardId?: unknown; dashboardName?: unknown; dashboardRef?: unknown; orgId?: unknown },
): Promise<ResolveDashboardResult> {
  const orgId = typeof input.orgId === "string" && input.orgId ? input.orgId : context.orgId;
  if (!orgId) {
    return {
      resolved: false,
      code: "NOT_FOUND",
      message: "orgId is required to resolve dashboard resources",
    };
  }

  const rawRef = [input.dashboardId, input.dashboardName, input.dashboardRef]
    .find((value) => typeof value === "string" && value.trim());
  const items = await datartRequest<FolderItem[]>("/api/v1/viz/folders/type", context, {
    params: { orgId, vizType: "DASHBOARD" },
  });

  return resolveDashboardRefFromCandidates(
    typeof rawRef === "string" ? rawRef : undefined,
    normalizeDashboardCandidates(items),
  );
}
