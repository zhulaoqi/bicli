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

  describe("route hints", () => {
    const env = {
      PERMISSION_MODE: "dataeye",
      DATART_API_URL: "https://visualization.example.test",
    };

    it("annotates dashboard_execute as realtime_query + diagnosis", () => {
      const tools = getEnabledTools(env);
      const dashboardExec = tools.find((t) => t.name === "dataeye_dashboard_execute");
      expect(dashboardExec?.routeHints).toEqual(
        expect.arrayContaining(["realtime_query", "diagnosis"]),
      );
      expect(dashboardExec?.routeHints).not.toContain("knowledge");
    });

    it("annotates schedule_manage as realtime_query + write_action", () => {
      const tools = getEnabledTools(env);
      const scheduleManage = tools.find((t) => t.name === "dataeye_schedule_manage");
      expect(scheduleManage?.routeHints).toEqual(
        expect.arrayContaining(["realtime_query", "write_action"]),
      );
      expect(scheduleManage?.routeHints).not.toContain("knowledge");
    });

    it("annotates schedule_logs as diagnosis-friendly", () => {
      const tools = getEnabledTools(env);
      const logs = tools.find((t) => t.name === "dataeye_schedule_logs");
      expect(logs?.routeHints).toEqual(
        expect.arrayContaining(["realtime_query", "diagnosis"]),
      );
    });

    it("annotates data_query / config_get as realtime_query and not knowledge", () => {
      const tools = getEnabledTools(env);
      const dataQuery = tools.find((t) => t.name === "data_query");
      const configGet = tools.find((t) => t.name === "config_get");
      expect(dataQuery?.routeHints).toEqual(
        expect.arrayContaining(["realtime_query"]),
      );
      expect(dataQuery?.routeHints).not.toContain("knowledge");
      expect(configGet?.routeHints).toEqual(
        expect.arrayContaining(["realtime_query"]),
      );
      expect(configGet?.routeHints).not.toContain("knowledge");
    });

    it("annotates audit_query as diagnosis", () => {
      const tools = getEnabledTools(env);
      const audit = tools.find((t) => t.name === "audit_query");
      expect(audit?.routeHints).toEqual(expect.arrayContaining(["diagnosis"]));
    });

    it("destructive write tools (delete/archive) are restricted to write_action route", () => {
      const tools = getEnabledTools(env);
      const scheduleDelete = tools.find((t) => t.name === "dataeye_schedule_delete");
      expect(scheduleDelete?.routeHints).toEqual(["write_action"]);
    });

    it("does not declare any knowledgeOnly tool yet (knowledge tools are added in P1)", () => {
      const tools = getEnabledTools(env);
      const knowledgeTools = tools.filter((t) => t.knowledgeOnly === true);
      expect(knowledgeTools).toEqual([]);
    });
  });
});
