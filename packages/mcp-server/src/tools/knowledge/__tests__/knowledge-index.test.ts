import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeIndex } from "../knowledge-index.js";

describe("KnowledgeIndex", () => {
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kindex-"));
    await fs.mkdir(join(dir, "datart-schedule"), { recursive: true });
    await fs.writeFile(
      join(dir, "datart-schedule", "SKILL.md"),
      `---\nname: datart-schedule\n---\n\n# Datart 定时任务\n\n## Cron 表达式\n\n用于配置看板的定时推送，例如 0 9 * * * 表示每天 9 点。\n\n## 立即执行\n\n手动触发一次任务，结果会推送到既定通道。\n`,
      "utf8",
    );
    await fs.mkdir(join(dir, "datart-dashboard"), { recursive: true });
    await fs.writeFile(
      join(dir, "datart-dashboard", "SKILL.md"),
      `---\nname: datart-dashboard\n---\n\n# Datart 看板\n\n## 概念\n\n看板（dashboard）是把多个图表组合在一个页面里展示的容器，支持定时推送。\n`,
      "utf8",
    );
  });

  it("loads markdown and splits sections by headings", async () => {
    const idx = new KnowledgeIndex([dir]);
    await idx.ensureLoaded();
    expect(idx.size()).toBeGreaterThanOrEqual(3);
  });

  it("returns title-matched section higher than body-only match", async () => {
    const idx = new KnowledgeIndex([dir]);
    await idx.ensureLoaded();
    const hits = idx.search("Cron");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toMatch(/Cron/);
  });

  it("expands synonyms (看板 ↔ dashboard)", async () => {
    const idx = new KnowledgeIndex([dir]);
    await idx.ensureLoaded();
    const hitsZh = idx.search("看板");
    const hitsEn = idx.search("dashboard");
    expect(hitsZh.length).toBeGreaterThan(0);
    expect(hitsEn.length).toBeGreaterThan(0);
  });

  it("returns empty when query is whitespace", async () => {
    const idx = new KnowledgeIndex([dir]);
    await idx.ensureLoaded();
    expect(idx.search("   ")).toEqual([]);
  });
});
