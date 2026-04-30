import { describe, expect, it } from "vitest";
import { getEnabledTools, getToolDomains, loadChatToolRegistry } from "../tool-domain-registry.js";

describe("tool domain registry", () => {
  it("enables DataEye tools only when DataEye mode or API URL is configured", () => {
    const disabled = getEnabledTools({});
    expect(disabled.some((tool) => tool.name === "dataeye_project_list")).toBe(false);

    const enabledByMode = getEnabledTools({ PERMISSION_MODE: "dataeye" });
    expect(enabledByMode.some((tool) => tool.name === "dataeye_project_list")).toBe(true);

    const enabledByUrl = getEnabledTools({ DATAEYE_API_URL: "https://dataeye.example.test" });
    expect(enabledByUrl.some((tool) => tool.name === "dataeye_project_list")).toBe(true);
  });

  it("omits visualization tools unless visualization API URL is configured", () => {
    const withoutVisualization = getEnabledTools({ PERMISSION_MODE: "dataeye" });
    expect(withoutVisualization.some((tool) => tool.name === "dataeye_dashboard_execute")).toBe(false);

    const withVisualization = getEnabledTools({
      PERMISSION_MODE: "dataeye",
      DATART_API_URL: "https://visualization.example.test",
    });
    expect(withVisualization.some((tool) => tool.name === "dataeye_dashboard_execute")).toBe(true);
  });

  it("includes business and atomic tools unless marked internal", () => {
    const tools = getEnabledTools({
      PERMISSION_MODE: "dataeye",
      DATART_API_URL: "https://visualization.example.test",
    });

    expect(tools.some((tool) => tool.name === "dataeye_dashboard_execute" && tool.tier === "business")).toBe(true);
    expect(tools.some((tool) => tool.name === "dataeye_chart_data_execute" && tool.tier === "atomic")).toBe(true);
    expect(tools.some((tool) => tool.internal)).toBe(false);
  });

  it("keeps tool names unique across enabled domains", () => {
    const tools = getEnabledTools({
      PERMISSION_MODE: "dataeye",
      DATART_API_URL: "https://visualization.example.test",
    });
    const names = tools.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("declares stable business domains", () => {
    expect(getToolDomains().map((domain) => domain.domain)).toEqual([
      "core",
      "dataeye",
      "visualization",
    ]);
  });

  it("builds chat handlers and tool definitions from the same enabled registry", async () => {
    const registry = await loadChatToolRegistry({
      PERMISSION_MODE: "dataeye",
      DATART_API_URL: "https://visualization.example.test",
    });

    expect(registry.handlers.dataeye_dashboard_execute).toBeTypeOf("function");
    expect(registry.definitions.some((definition) => definition.name === "dataeye_dashboard_execute")).toBe(true);
    expect(registry.definitions.some((definition) => definition.name === "audit_write")).toBe(false);
  });
});
