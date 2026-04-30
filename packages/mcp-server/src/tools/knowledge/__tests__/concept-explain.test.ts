import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataeyeConceptExplain: typeof import("../concept-explain.js")["dataeyeConceptExplain"];

describe("dataeyeConceptExplain", () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "kconcept-"));
    await fs.mkdir(join(dir, "datart-schedule"), { recursive: true });
    await fs.writeFile(
      join(dir, "datart-schedule", "SKILL.md"),
      `# Datart 定时任务\n\n## 自定义触发器\n\n这是一个不在静态词典里的概念。\n`,
      "utf8",
    );
    process.env.BICLI_KNOWLEDGE_DIR = dir;
    ({ dataeyeConceptExplain } = await import("../concept-explain.js"));
  });

  it("returns BAD_INPUT when concept missing", async () => {
    const out = await dataeyeConceptExplain({} as any, {} as any, { concept: "" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("BAD_INPUT");
  });

  it("returns static_dictionary entry on direct hit", async () => {
    const out = await dataeyeConceptExplain({} as any, {} as any, { concept: "漏斗分析" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.source).toBe("static_dictionary");
    expect(payload.data.concept).toBe("漏斗分析");
  });

  it("matches by alias (dashboard → 看板)", async () => {
    const out = await dataeyeConceptExplain({} as any, {} as any, { concept: "dashboard" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.concept).toBe("看板");
  });

  it("falls back to knowledge index when no concept match", async () => {
    const out = await dataeyeConceptExplain({} as any, {} as any, { concept: "自定义触发器" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(true);
    if (payload.data.relatedSections) {
      expect(payload.data.source).toBe("knowledge_index_fallback");
    }
  });
});
