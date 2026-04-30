import { promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface KnowledgeSection {
  /** 唯一 key，例如 "datart-schedule:Cron" */
  id: string;
  /** 知识来源（skill 名 / docs 文件名） */
  source: string;
  /** 章节标题 */
  title: string;
  /** 章节正文（Markdown） */
  body: string;
  /** 路径（绝对/相对路径） */
  path: string;
}

export interface SearchResult extends KnowledgeSection {
  score: number;
  matchedTokens: string[];
}

const SYNONYMS: Record<string, string[]> = {
  漏斗: ["funnel"],
  funnel: ["漏斗"],
  留存: ["retention"],
  retention: ["留存"],
  看板: ["dashboard", "仪表盘"],
  dashboard: ["看板", "仪表盘"],
  仪表盘: ["看板", "dashboard"],
  图表: ["chart"],
  chart: ["图表"],
  事件: ["event", "埋点"],
  event: ["事件", "埋点"],
  埋点: ["事件", "event"],
  定时: ["schedule", "调度"],
  schedule: ["定时", "调度"],
  调度: ["schedule", "定时"],
  用户: ["user", "账号", "账户"],
  user: ["用户", "账号"],
  权限: ["permission", "role", "角色"],
  permission: ["权限"],
  角色: ["role", "权限"],
  role: ["角色"],
  分析: ["analysis"],
  analysis: ["分析"],
};

const STOPWORDS = new Set([
  "的", "了", "和", "或", "在", "是", "有", "下", "上", "为", "和", "及", "以",
  "如", "等", "也", "我", "你", "我们", "什么", "怎么", "怎样", "如何",
  "the", "a", "an", "of", "in", "to", "and", "or", "is", "are",
]);

export class KnowledgeIndex {
  private sections: KnowledgeSection[] = [];
  private loaded = false;
  private rootCandidates: string[];

  constructor(rootCandidates?: string[]) {
    if (rootCandidates && rootCandidates.length > 0) {
      this.rootCandidates = rootCandidates;
    } else {
      const here = dirname(fileURLToPath(import.meta.url));
      this.rootCandidates = [
        process.env.BICLI_KNOWLEDGE_DIR,
        resolve(process.cwd(), "packages/skills/definitions"),
        resolve(process.cwd(), "../skills/definitions"),
        resolve(here, "../../../../skills/definitions"),
      ].filter(Boolean) as string[];
    }
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    for (const root of this.rootCandidates) {
      try {
        await fs.access(root);
        await this.loadFromDir(root);
        break;
      } catch {
        continue;
      }
    }
    this.loaded = true;
    if (this.sections.length === 0) {
      console.warn("[knowledge-index] no sections loaded; check BICLI_KNOWLEDGE_DIR or skills definitions path");
    } else {
      console.log(`[knowledge-index] loaded ${this.sections.length} sections from ${this.rootCandidates[0]}`);
    }
  }

  private async loadFromDir(root: string): Promise<void> {
    const files = await listMarkdownFiles(root);
    for (const file of files) {
      try {
        const text = await fs.readFile(file, "utf8");
        const sections = splitMarkdownIntoSections(text, file, root);
        this.sections.push(...sections);
      } catch (err) {
        console.warn(`[knowledge-index] failed to read ${file}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  search(query: string, topK = 5): SearchResult[] {
    if (!query.trim()) return [];
    const tokens = tokenize(query);
    const expanded = expandSynonyms(tokens);
    if (expanded.size === 0) return [];

    const results: SearchResult[] = [];
    for (const sec of this.sections) {
      const titleLower = sec.title.toLowerCase();
      const bodyLower = sec.body.toLowerCase();
      let score = 0;
      const matched: string[] = [];
      for (const t of expanded) {
        if (titleLower.includes(t)) {
          score += 3;
          matched.push(t);
        } else if (bodyLower.includes(t)) {
          score += 1;
          matched.push(t);
        }
      }
      if (score > 0) {
        results.push({ ...sec, score, matchedTokens: matched });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  size(): number {
    return this.sections.length;
  }

  /** 测试用：重置已加载 */
  reset(): void {
    this.sections = [];
    this.loaded = false;
  }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = await fs.readdir(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const full = resolve(cur, name);
      try {
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          stack.push(full);
        } else if (stat.isFile() && full.endsWith(".md")) {
          out.push(full);
        }
      } catch {
        continue;
      }
    }
  }
  return out;
}

function splitMarkdownIntoSections(text: string, filePath: string, root: string): KnowledgeSection[] {
  // 去掉 frontmatter
  const stripped = text.replace(/^---[\s\S]*?\n---\n/, "");
  const lines = stripped.split("\n");
  const sections: KnowledgeSection[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const sourceParts = filePath.replace(root + sep, "").split(sep);
  const source = sourceParts[0] ?? filePath;

  const flush = () => {
    if (!currentTitle && currentBody.every((l) => !l.trim())) return;
    const title = currentTitle || sourceParts[sourceParts.length - 1].replace(/\.md$/, "");
    const body = currentBody.join("\n").trim();
    if (!body) return;
    sections.push({
      id: `${source}:${title}`,
      source,
      title,
      body,
      path: filePath,
    });
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      flush();
      currentTitle = headerMatch[2].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

function tokenize(query: string): string[] {
  const cleaned = query.toLowerCase().replace(/[，。！？、；：（）()\[\]【】"'`]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
  // 中文按 1-3 字符滑窗补充
  const extras: string[] = [];
  for (const t of tokens) {
    if (/[\u4e00-\u9fa5]/.test(t) && t.length >= 2) {
      for (let i = 0; i < t.length - 1; i++) {
        extras.push(t.slice(i, i + 2));
      }
    }
  }
  return Array.from(new Set([...tokens, ...extras]));
}

function expandSynonyms(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    const syn = SYNONYMS[t];
    if (syn) syn.forEach((s) => out.add(s.toLowerCase()));
  }
  return out;
}

let singleton: KnowledgeIndex | null = null;

export function getKnowledgeIndex(): KnowledgeIndex {
  if (!singleton) singleton = new KnowledgeIndex();
  return singleton;
}
