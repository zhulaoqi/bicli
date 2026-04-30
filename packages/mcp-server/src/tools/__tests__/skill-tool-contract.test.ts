import { describe, expect, it } from "vitest";
import { loadAllSkills } from "@bicli/core";
import { resolve } from "node:path";
import { getEnabledTools } from "../tool-domain-registry.js";

const skillsDir = resolve(process.cwd(), "../skills/definitions");
const enabledTools = getEnabledTools({
  PERMISSION_MODE: "dataeye",
  DATAEYE_API_URL: "https://dataeye.example.test",
  DATART_API_URL: "https://visualization.example.test",
});
const toolNames = new Set(enabledTools.map((tool) => tool.name));

describe("Skill and MCP tool contracts", () => {
  it("keeps DataEye Skill requiredTools aligned with registered MCP tools", () => {
    const skills = loadAllSkills(skillsDir).filter((skill) => skill.name.startsWith("dataeye-"));

    const missing = skills.flatMap((skill) =>
      skill.requiredTools
        .filter((toolName) => !toolNames.has(toolName))
        .map((toolName) => `${skill.name}:${toolName}`),
    );

    expect(missing).toEqual([]);
  });

  it("keeps write-oriented business actions explicit about dryRun confirmation", () => {
    const writeBusinessTools = enabledTools.filter((tool) =>
      ["dataeye_user_onboard", "dataeye_table_import_create"].includes(tool.name),
    );

    expect(writeBusinessTools.map((tool) => tool.name).sort()).toEqual([
      "dataeye_table_import_create",
      "dataeye_user_onboard",
    ]);
    for (const tool of writeBusinessTools) {
      const properties = tool.inputSchema?.properties as Record<string, unknown> | undefined;
      expect(properties?.dryRun, `${tool.name} must expose dryRun`).toBeDefined();
      expect(tool.description).toMatch(/确认|预览|dryRun/i);
    }
  });
});
