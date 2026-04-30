import type { Database } from "../../db/connection.js";
import type { PermissionAdapter } from "../../auth/adapter.js";
import { getKnowledgeIndex } from "./knowledge-index.js";

export const dataeyeKnowledgeSearchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "要查询的关键词或问题描述" },
    topK: { type: "number", description: "返回前 K 个章节（默认 5，最大 8）", minimum: 1, maximum: 8 },
  },
  required: ["query"],
} as const;

export async function dataeyeKnowledgeSearch(
  _db: Database,
  _adapter: PermissionAdapter,
  args: Record<string, unknown>,
) {
  const query = String((args.query as string) ?? "").trim();
  const topK = Math.max(1, Math.min(8, Number(args.topK) || 5));
  if (!query) {
    return formatJson({ success: false, error: { code: "BAD_INPUT", message: "query 必填" } });
  }

  const index = getKnowledgeIndex();
  await index.ensureLoaded();
  const hits = index.search(query, topK);

  if (hits.length === 0) {
    return formatJson({
      success: true,
      data: {
        query,
        results: [],
        message: "未在 BiCLI 知识库中找到相关章节，可改用更具体的关键词或调用业务工具查询实时数据。",
      },
    });
  }

  return formatJson({
    success: true,
    data: {
      query,
      total: hits.length,
      results: hits.map((h) => ({
        source: h.source,
        title: h.title,
        score: h.score,
        matchedTokens: h.matchedTokens,
        excerpt: truncate(h.body, 600),
      })),
      hint: "上述章节来自 BiCLI 内置知识库；若需进一步事实，建议结合业务工具调用获取实时数据。",
    },
  });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function formatJson(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}
