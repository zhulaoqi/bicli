import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataeyeKnowledgeSearch: typeof import("../knowledge-search.js")["dataeyeKnowledgeSearch"];

describe("dataeyeKnowledgeSearch", () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ksearch-"));
    await fs.mkdir(join(dir, "datart-schedule"), { recursive: true });
    await fs.writeFile(
      join(dir, "datart-schedule", "SKILL.md"),
      `# Datart 定时任务\n\n## Cron 表达式\n\n用于配置看板的定时推送，例如 0 9 * * *。\n`,
      "utf8",
    );
    process.env.BICLI_KNOWLEDGE_DIR = dir;
    ({ dataeyeKnowledgeSearch } = await import("../knowledge-search.js"));
  });

  it("returns BAD_INPUT when query empty", async () => {
    const out = await dataeyeKnowledgeSearch({} as any, {} as any, { query: "  " });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("BAD_INPUT");
  });

  it("returns formatted hits when query matches", async () => {
    const out = await dataeyeKnowledgeSearch({} as any, {} as any, { query: "Cron" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data.results)).toBe(true);
    expect(payload.data.results.length).toBeGreaterThan(0);
  });

  it("returns empty results gracefully", async () => {
    const out = await dataeyeKnowledgeSearch({} as any, {} as any, { query: "__no_match_xyz__" });
    const payload = JSON.parse(out.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.results).toEqual([]);
    expect(typeof payload.data.message).toBe("string");
  });
});
