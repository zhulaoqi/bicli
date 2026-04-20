import { describe, it, expect } from "vitest";
import { parseSkill } from "../parser.js";

const sampleSkill = `---
name: form-builder
title: 智能表单创建
description: 根据用户需求创建动态表单
triggers:
  - 创建表单
  - 新建表单
required_tools:
  - form_create
  - form_query
required_permissions:
  - form:write
  - form:read
---

# 智能表单创建

这是 Skill 的正文内容。`;

describe("parseSkill", () => {
  it("should parse frontmatter and content correctly", () => {
    const skill = parseSkill(sampleSkill);
    expect(skill.name).toBe("form-builder");
    expect(skill.title).toBe("智能表单创建");
    expect(skill.triggers).toEqual(["创建表单", "新建表单"]);
    expect(skill.requiredTools).toEqual(["form_create", "form_query"]);
    expect(skill.requiredPermissions).toEqual(["form:write", "form:read"]);
    expect(skill.content).toContain("这是 Skill 的正文内容");
  });

  it("should throw on invalid frontmatter", () => {
    expect(() => parseSkill("no frontmatter here")).toThrow();
  });
});
