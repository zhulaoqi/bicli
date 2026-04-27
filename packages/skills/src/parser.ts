import matter from "gray-matter";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Skill {
  name: string;
  title: string;
  description: string;
  triggers: string[];
  requiredTools: string[];
  requiredPermissions: string[];
  content: string;
  /** Absolute path to the skill's root directory (for directory-based skills) or the .md file */
  skillPath: string;
  /** Names of bundled reference files (e.g. ["api-reference.md", "examples.md"]) */
  references: string[];
}

function deriveTitle(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractTriggersFromDescription(description: string, name: string): string[] {
  const triggers: string[] = [];
  const nameWords = name.split("-").filter((w) => w.length > 1);
  triggers.push(...nameWords);
  triggers.push(name.replace(/-/g, " "));

  const keyPhrases = description
    .replace(/["""'']/g, "")
    .split(/[,.;!?]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 30)
    .slice(0, 5);
  triggers.push(...keyPhrases.map((p) => p.toLowerCase()));

  return [...new Set(triggers)].slice(0, 10);
}

export function parseSkill(raw: string, skillPath: string = "", references: string[] = []): Skill {
  const { data, content } = matter(raw);
  if (!data.name) {
    throw new Error("Skill frontmatter must include 'name'");
  }

  const description = typeof data.description === "string"
    ? data.description
    : "";
  const triggers = data.triggers || extractTriggersFromDescription(description, data.name);
  const requiredTools = data.required_tools || data.requiredTools || [];
  const requiredPermissions = data.required_permissions || data.requiredPermissions || [];

  return {
    name: data.name,
    title: data.title || deriveTitle(data.name),
    description,
    triggers,
    requiredTools,
    requiredPermissions,
    content: content.trim(),
    skillPath,
    references,
  };
}

function discoverReferences(skillDir: string): string[] {
  const refs: string[] = [];
  for (const subdir of ["reference", "references"]) {
    const refDir = join(skillDir, subdir);
    if (existsSync(refDir) && statSync(refDir).isDirectory()) {
      for (const f of readdirSync(refDir)) {
        if (f.endsWith(".md")) refs.push(f);
      }
    }
  }
  for (const f of readdirSync(skillDir)) {
    if (f === "SKILL.md" || f === "LICENSE.txt") continue;
    if (f.endsWith(".md")) refs.push(f);
  }
  return [...new Set(refs)];
}

function loadSkillFromDirectory(dirPath: string): Skill | null {
  const skillFile = join(dirPath, "SKILL.md");
  if (!existsSync(skillFile)) return null;

  const raw = readFileSync(skillFile, "utf-8");
  const references = discoverReferences(dirPath);
  return parseSkill(raw, dirPath, references);
}

export function loadAllSkills(definitionsDir: string): Skill[] {
  const dir = resolve(definitionsDir);
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir);
  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        const skill = loadSkillFromDirectory(fullPath);
        if (skill && !seen.has(skill.name)) {
          seen.add(skill.name);
          skills.push(skill);
        }
      } else if (entry.endsWith(".md")) {
        const raw = readFileSync(fullPath, "utf-8");
        const skill = parseSkill(raw, fullPath, []);
        if (!seen.has(skill.name)) {
          seen.add(skill.name);
          skills.push(skill);
        }
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse skill ${entry}:`, err);
    }
  }
  return skills;
}

export function loadSkillReference(skill: Skill, refName: string): string | null {
  if (!skill.skillPath) return null;
  const stat = statSync(skill.skillPath);
  const skillDir = stat.isDirectory() ? skill.skillPath : resolve(skill.skillPath, "..");

  const candidates = [
    join(skillDir, "reference", refName),
    join(skillDir, "references", refName),
    join(skillDir, refName),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  return null;
}
