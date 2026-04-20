import type { Skill } from "@bicli/skills";

interface ScoredMatch {
  skill: Skill;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function computeScore(userTokens: string[], trigger: string, rawInput: string): number {
  const triggerLower = trigger.toLowerCase();
  const inputLower = rawInput.toLowerCase();

  if (inputLower.includes(triggerLower)) return 1.0;
  if (triggerLower.includes(inputLower) && inputLower.length >= triggerLower.length * 0.5) return 0.8;

  const triggerTokens = tokenize(trigger);
  const userJoined = userTokens.join(" ");
  if (userJoined.includes(triggerLower)) return 1.0;

  let matched = 0;
  for (const tt of triggerTokens) {
    if (userTokens.some((ut) => ut === tt)) {
      matched++;
    } else if (userTokens.some((ut) => ut.includes(tt) || tt.includes(ut))) {
      matched += 0.5;
    }
  }

  return triggerTokens.length > 0 ? matched / triggerTokens.length : 0;
}

const FUZZY_THRESHOLD = 0.6;

export class SkillMatcher {
  private skills: Skill[];

  constructor(skills: Skill[]) {
    this.skills = skills;
  }

  getAll(): Skill[] {
    return [...this.skills];
  }

  match(userInput: string, userPermissions?: string[]): Skill | null {
    const userTokens = tokenize(userInput);
    if (userTokens.length === 0) return null;

    let best: ScoredMatch | null = null;

    for (const skill of this.skills) {
      if (userPermissions && skill.requiredPermissions.length > 0) {
        if (!skill.requiredPermissions.every((p) => userPermissions.includes(p))) {
          continue;
        }
      }

      let maxScore = 0;
      for (const trigger of skill.triggers) {
        const score = computeScore(userTokens, trigger, userInput);
        if (score > maxScore) maxScore = score;
        if (maxScore >= 1.0) break;
      }

      if (maxScore >= FUZZY_THRESHOLD && (!best || maxScore > best.score)) {
        best = { skill, score: maxScore };
      }
    }

    return best?.skill ?? null;
  }
}
