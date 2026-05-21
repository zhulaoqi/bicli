import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * 列出当前用户可访问的已保存自助分析
 * POST /api/self-analysis-event/page
 *
 * type: 1=事件分析 2=漏斗分析 3=留存分析 4=用户行为
 */
type RawAnalysisListResult = {
  records?: Array<{
    id: number;
    name: string;
    type: number;
    status?: number;
    projectId?: number;
    projectName?: string;
    productId?: number;
    productName?: string;
    createBy?: string;
    represent?: string | null;
    updateTime?: string;
    createTime?: string;
    isFavorites?: boolean;
  }>;
  total?: number;
  current?: number;
  pages?: number;
};

const typeLabel: Record<number, string> = {
  1: "事件分析",
  2: "漏斗分析",
  3: "留存分析",
  4: "用户行为分析",
};

export function normalizeAnalysisListResult(data: RawAnalysisListResult) {
  const analyses = (data.records ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    typeName: typeLabel[r.type] ?? `类型${r.type}`,
    projectId: r.projectId,
    projectName: r.projectName,
    productId: r.productId,
    productName: r.productName,
    createBy: r.createBy,
    represent: r.represent,
    isFavorites: r.isFavorites,
    updateTime: r.updateTime,
    navigation: {
      projectId: r.projectId,
      productId: r.productId,
      analysisId: r.id,
      type: r.type,
      target: analysisTargetPath(r.type, r.id),
    },
  }));

  return {
    total: data.total ?? analyses.length,
    page: data.current ?? 1,
    totalPages: data.pages ?? 1,
    analyses,
  };
}

function analysisTargetPath(type: number, id: number): string {
  const map: Record<number, string> = {
    1: "event",
    2: "funnel",
    3: "retention",
    4: "behavior",
  };
  return `/dataAnalysis/${map[type] ?? "event"}?id=${id}`;
}

export async function dateyeAnalysisList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      projectId,
      type,
      name,
      page = 1,
      pageCount = 50,
      isFavorites = false,
      orderBy = "updateTime desc",
    } = cleanArgs;

    const body: Record<string, unknown> = {
      page: Number(page),
      pageCount: Number(pageCount),
      saveType: 1,
      isFavorites: Boolean(isFavorites),
      orderBy: String(orderBy),
    };
    // projectId 可选：不传时后端自动跨全部可访问项目查询
    if (projectId !== undefined && projectId !== null) body.projectId = Number(projectId);
    if (type !== undefined) body.type = Number(type);
    if (name) body.name = String(name);

    const data = await dateyeRequest<RawAnalysisListResult>("/api/self-analysis-event/page", context, { method: "POST", body });

    return formatSuccess(normalizeAnalysisListResult(data));
  });
}

export const dateyeAnalysisListDef = {
  name: "dataeye_analysis_list",
  description: "列出当前用户可访问的已保存自助分析（事件/漏斗/留存），不传 projectId 时自动跨全部项目查询，无需逐项目循环",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "number",
        description: "项目ID（可选），不填则跨全部可访问项目查询",
      },
      type: {
        type: "number",
        enum: [1, 2, 3, 4],
        description: "分析类型（可选）：1=事件分析 2=漏斗分析 3=留存分析 4=用户行为分析",
      },
      name: {
        type: "string",
        description: "按名称模糊搜索（可选）",
      },
      page: {
        type: "number",
        description: "页码，默认 1",
      },
      pageCount: {
        type: "number",
        description: "每页数量，默认 50，最多 100",
      },
      isFavorites: {
        type: "boolean",
        description: "仅查看收藏的分析，默认 false",
      },
      orderBy: {
        type: "string",
        description: "排序规则，默认 'updateTime desc'（按更新时间倒序），可传 'updateTime asc' 正序",
      },
    },
    required: [],
  },
};
