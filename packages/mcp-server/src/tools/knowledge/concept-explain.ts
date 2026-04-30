import type { Database } from "../../db/connection.js";
import type { PermissionAdapter } from "../../auth/adapter.js";
import { findConcept } from "./concepts.js";
import { getKnowledgeIndex } from "./knowledge-index.js";

export const dataeyeConceptExplainSchema = {
  type: "object",
  properties: {
    concept: { type: "string", description: "要解释的概念名（中英文均可）" },
  },
  required: ["concept"],
} as const;

export async function dataeyeConceptExplain(
  _db: Database,
  _adapter: PermissionAdapter,
  args: Record<string, unknown>,
) {
  const concept = String((args.concept as string) ?? "").trim();
  if (!concept) {
    return formatJson({ success: false, error: { code: "BAD_INPUT", message: "concept 必填" } });
  }

  const hit = findConcept(concept);
  if (hit) {
    return formatJson({
      success: true,
      data: {
        concept: hit.name,
        aliases: hit.aliases,
        definition: hit.definition,
        usage: hit.usage,
        references: hit.references ?? [],
        source: "static_dictionary",
      },
    });
  }

  // 未命中静态词典 → 回落到 knowledge search 取相关章节
  const index = getKnowledgeIndex();
  await index.ensureLoaded();
  const hits = index.search(concept, 3);
  if (hits.length === 0) {
    return formatJson({
      success: true,
      data: {
        concept,
        definition: null,
        message: "未在概念词典或知识库中找到该概念。可尝试使用更具体的中文/英文术语，或调用业务工具获取实时定义。",
      },
    });
  }
  return formatJson({
    success: true,
    data: {
      concept,
      definition: null,
      source: "knowledge_index_fallback",
      relatedSections: hits.map((h) => ({
        source: h.source,
        title: h.title,
        score: h.score,
        excerpt: h.body.slice(0, 400) + (h.body.length > 400 ? "…" : ""),
      })),
    },
  });
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
