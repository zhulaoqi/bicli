import { describe, it, expect } from "vitest";
import { SkillMatcher } from "../src/skill-loader/matcher.js";
import type { Skill } from "@bicli/skills";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test-skill",
    title: "Test",
    description: "Test skill",
    triggers: ["创建表单"],
    requiredTools: [],
    requiredPermissions: [],
    content: "",
    ...overrides,
  };
}

describe("SkillMatcher", () => {
  describe("exact matching", () => {
    it("matches when input contains trigger exactly", () => {
      const skill = makeSkill({ triggers: ["创建表单"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("帮我创建表单")).toBe(skill);
    });

    it("returns null when no trigger matches", () => {
      const skill = makeSkill({ triggers: ["创建表单"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("天气怎么样")).toBeNull();
    });
  });

  describe("fuzzy matching", () => {
    it("matches when input is a substring of trigger (Chinese)", () => {
      const skill = makeSkill({ triggers: ["查询用户列表"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("查询用户")).toBe(skill);
    });

    it("matches when trigger is embedded in longer input (Chinese)", () => {
      const skill = makeSkill({ triggers: ["查询用户列表"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("请帮我查询用户列表")).toBe(skill);
    });

    it("is case insensitive for English triggers", () => {
      const skill = makeSkill({ triggers: ["create form"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("CREATE FORM please")).toBe(skill);
    });

    it("selects highest scoring skill when multiple match", () => {
      const form = makeSkill({ name: "form", triggers: ["创建表单", "表单"] });
      const user = makeSkill({ name: "user", triggers: ["创建用户", "用户管理"] });
      const matcher = new SkillMatcher([form, user]);
      expect(matcher.match("我要创建用户")?.name).toBe("user");
    });
  });

  describe("permission filtering", () => {
    it("skips skill when user lacks required permissions", () => {
      const skill = makeSkill({
        triggers: ["创建表单"],
        requiredPermissions: ["form:write"],
      });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("创建表单", ["form:read"])).toBeNull();
    });

    it("matches when user has all required permissions", () => {
      const skill = makeSkill({
        triggers: ["创建表单"],
        requiredPermissions: ["form:write"],
      });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("创建表单", ["form:write", "form:read"])).toBe(skill);
    });

    it("matches skill with no permission requirements regardless of user perms", () => {
      const skill = makeSkill({ triggers: ["帮助"] });
      const matcher = new SkillMatcher([skill]);
      expect(matcher.match("帮助", ["form:read"])).toBe(skill);
    });
  });

  describe("getAll", () => {
    it("returns a copy of all skills", () => {
      const skills = [makeSkill({ name: "a" }), makeSkill({ name: "b" })];
      const matcher = new SkillMatcher(skills);
      const all = matcher.getAll();
      expect(all).toHaveLength(2);
      expect(all).not.toBe(skills);
    });
  });
});
