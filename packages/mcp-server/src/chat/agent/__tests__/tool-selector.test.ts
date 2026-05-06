import { describe, expect, it } from "vitest";
import { selectToolsForRoute } from "../tool-selector.js";
import type { RouteDecision } from "../agent-state.js";
import type { ToolDef } from "../../../tools/tool-domain-registry.js";

const handler = async () => "";

const fakeRegistry: ToolDef[] = [
  // knowledge tools (placeholder for P1)
  { domain: "knowledge", tier: "atomic", name: "dataeye_knowledge_search", description: "", requiredPermissions: [], handler, routeHints: ["knowledge", "visual_explain"], knowledgeOnly: true },
  { domain: "knowledge", tier: "atomic", name: "dataeye_concept_explain", description: "", requiredPermissions: [], handler, routeHints: ["knowledge", "visual_explain"], knowledgeOnly: true },

  // schedule tools
  { domain: "visualization", tier: "business", name: "dataeye_schedule_manage", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_list", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_detail", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_logs", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_create", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_update", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_delete", description: "", requiredPermissions: [], handler, routeHints: ["write_action"], destructive: ["delete", "archive"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_schedule_copy", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },

  // dashboard
  { domain: "visualization", tier: "business", name: "dataeye_dashboard_execute", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },
  { domain: "visualization", tier: "atomic", name: "dataeye_dashboard_list", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },

  // analysis
  { domain: "dataeye", tier: "atomic", name: "dataeye_analysis_execute", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },

  // user
  { domain: "dataeye", tier: "business", name: "dataeye_user_onboard", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "dataeye", tier: "atomic", name: "dataeye_role_create", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "dataeye", tier: "atomic", name: "dataeye_user_create", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "write_action"] },
  { domain: "dataeye", tier: "atomic", name: "dataeye_user_list", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query", "diagnosis"] },

  // generic
  { domain: "core", tier: "atomic", name: "data_query", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query"] },
  { domain: "core", tier: "atomic", name: "config_get", description: "", requiredPermissions: [], handler, routeHints: ["realtime_query"] },
  { domain: "core", tier: "atomic", name: "audit_query", description: "", requiredPermissions: [], handler, routeHints: ["diagnosis"] },
];

const baseDecision = (overrides: Partial<RouteDecision> = {}): RouteDecision => ({
  route: "realtime_query",
  confidence: 0.8,
  domains: [],
  needsKnowledge: false,
  needsUserConfirm: false,
  reasoning: "test",
  ...overrides,
});

describe("selectToolsForRoute", () => {
  describe("knowledge route", () => {
    it("only exposes knowledgeOnly tools and forbids data/write tools", () => {
      const result = selectToolsForRoute(fakeRegistry, baseDecision({ route: "knowledge", needsKnowledge: true }));
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toEqual(expect.arrayContaining(["dataeye_knowledge_search", "dataeye_concept_explain"]));
      expect(allowedNames).not.toContain("data_query");
      expect(allowedNames).not.toContain("config_get");
      expect(allowedNames).not.toContain("dataeye_schedule_create");
      expect(allowedNames).not.toContain("dataeye_schedule_delete");
      expect(allowedNames).not.toContain("dataeye_schedule_list");
      expect(allowedNames).not.toContain("dataeye_dashboard_execute");
      expect(result.forbidden.length).toBeGreaterThan(0);
    });
  });

  describe("realtime_query route + schedule domain", () => {
    it("includes schedule list/detail/logs but excludes destructive delete", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "realtime_query", domains: ["schedule"] }),
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toEqual(
        expect.arrayContaining(["dataeye_schedule_list", "dataeye_schedule_detail", "dataeye_schedule_logs"]),
      );
      expect(allowedNames).not.toContain("dataeye_schedule_delete");
      // 跨域工具仍然可见但优先级降低（仍可被调用）；至少 schedule 域被保留
      expect(allowedNames).toContain("dataeye_dashboard_list");
    });
  });

  describe("write_action route + schedule domain", () => {
    it("prefers business-tier dataeye_schedule_manage and forbids atomic write tools", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "write_action", domains: ["schedule"], needsUserConfirm: true }),
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toContain("dataeye_schedule_manage");
      expect(allowedNames).not.toContain("dataeye_schedule_create");
      expect(allowedNames).not.toContain("dataeye_schedule_update");
      expect(allowedNames).not.toContain("dataeye_schedule_copy");
      expect(allowedNames).not.toContain("dataeye_schedule_delete");
      expect(result.forbidden).toEqual(
        expect.arrayContaining(["dataeye_schedule_create", "dataeye_schedule_update"]),
      );
    });

    it("prefers business user_onboard over atomic user_create", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "write_action", domains: ["user"], needsUserConfirm: true }),
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toContain("dataeye_user_onboard");
      expect(allowedNames).not.toContain("dataeye_user_create");
    });

    it("suppresses role_create when user only asks to create user", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "write_action", domains: ["user", "role"], needsUserConfirm: true }),
        { userMessage: "帮我创建一个用户并分配已有角色" },
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toContain("dataeye_user_onboard");
      expect(allowedNames).not.toContain("dataeye_role_create");
    });

    it("allows role_create when user explicitly asks to create role", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "write_action", domains: ["role"], needsUserConfirm: true }),
        { userMessage: "请创建一个角色叫测试角色A" },
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toContain("dataeye_role_create");
    });
  });

  describe("diagnosis route", () => {
    it("includes detail/logs/audit but no write tools", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "diagnosis", domains: ["schedule"] }),
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toEqual(
        expect.arrayContaining(["dataeye_schedule_logs", "dataeye_schedule_detail", "audit_query"]),
      );
      expect(allowedNames).not.toContain("dataeye_schedule_delete");
      expect(allowedNames).not.toContain("dataeye_schedule_create");
      expect(allowedNames).not.toContain("dataeye_schedule_manage");
    });
  });

  describe("visual_explain route", () => {
    it("includes knowledge tools and limited list tools, no write/destructive", () => {
      const result = selectToolsForRoute(
        fakeRegistry,
        baseDecision({ route: "visual_explain", needsKnowledge: true }),
      );
      const allowedNames = result.allowed.map((t) => t.name);
      expect(allowedNames).toEqual(
        expect.arrayContaining(["dataeye_knowledge_search", "dataeye_concept_explain"]),
      );
      expect(allowedNames).not.toContain("dataeye_schedule_delete");
      expect(allowedNames).not.toContain("dataeye_schedule_create");
      expect(allowedNames).not.toContain("dataeye_schedule_manage");
      expect(allowedNames).not.toContain("data_query");
    });
  });

  describe("default behavior for tools without routeHints", () => {
    it("falls back to realtime_query+diagnosis defaults", () => {
      const noHintTool: ToolDef = {
        domain: "core",
        tier: "atomic",
        name: "mystery_tool",
        description: "",
        requiredPermissions: [],
        handler,
      };
      const registry = [...fakeRegistry, noHintTool];
      const realtime = selectToolsForRoute(registry, baseDecision({ route: "realtime_query" }));
      const knowledge = selectToolsForRoute(registry, baseDecision({ route: "knowledge", needsKnowledge: true }));
      expect(realtime.allowed.map((t) => t.name)).toContain("mystery_tool");
      expect(knowledge.allowed.map((t) => t.name)).not.toContain("mystery_tool");
    });
  });
});
