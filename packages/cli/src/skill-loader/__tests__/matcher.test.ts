import { describe, it, expect } from "vitest";
import { SkillMatcher } from "@bicli/core";
import type { Skill } from "@bicli/skills";

const mockSkills: Skill[] = [
  {
    name: "form-builder",
    title: "智能表单创建",
    description: "创建动态表单",
    triggers: ["创建表单", "新建表单", "生成表单"],
    requiredTools: ["form_create", "form_query"],
    requiredPermissions: ["form:write", "form:read"],
    content: "# Skill content",
  },
  {
    name: "data-query",
    title: "数据查询助手",
    description: "数据查询",
    triggers: ["查询", "查一下", "统计", "列出"],
    requiredTools: ["data_query", "data_aggregate"],
    requiredPermissions: ["data:read"],
    content: "# Query content",
  },
];

describe("SkillMatcher", () => {
  const matcher = new SkillMatcher(mockSkills);

  it("should match skill by trigger keyword", () => {
    const result = matcher.match("帮我创建表单");
    expect(result?.name).toBe("form-builder");
  });

  it("should match data query skill", () => {
    const result = matcher.match("查询所有用户");
    expect(result?.name).toBe("data-query");
  });

  it("should return null when no match", () => {
    const result = matcher.match("你好");
    expect(result).toBeNull();
  });
});
