import { describe, expect, it } from "vitest";
import {
  isReadOnlyListToolName,
  mergeToolsAfterSubAgentFilter,
  toolNameMatchesDomain,
} from "../tool-guard.js";

describe("tool-guard", () => {
  it("detects read-only list tools", () => {
    expect(isReadOnlyListToolName("dataeye_project_list")).toBe(true);
    expect(isReadOnlyListToolName("dataeye_role_create")).toBe(false);
  });

  it("matches tool names to domains", () => {
    expect(toolNameMatchesDomain("dataeye_project_list", "project")).toBe(true);
    expect(toolNameMatchesDomain("dataeye_view_list", "view")).toBe(true);
    expect(toolNameMatchesDomain("dataeye_project_list", "role")).toBe(false);
  });

  it("restores domain list tools after sub-agent filter", () => {
    const before = [
      "dataeye_user_list",
      "dataeye_role_list",
      "dataeye_project_list",
      "dataeye_event_analysis",
    ];
    const after = ["dataeye_user_list", "dataeye_role_list"];
    const { merged, restored } = mergeToolsAfterSubAgentFilter(
      before,
      after,
      ["project", "role"],
      [],
    );
    expect(restored).toContain("dataeye_project_list");
    expect(merged).toContain("dataeye_project_list");
    expect(merged).not.toContain("dataeye_event_analysis");
  });

  it("restores skill required tools even without domain match", () => {
    const before = ["dataeye_view_list", "dataeye_user_list"];
    const after = ["dataeye_user_list"];
    const { merged } = mergeToolsAfterSubAgentFilter(before, after, [], [
      "dataeye_view_list",
    ]);
    expect(merged).toContain("dataeye_view_list");
  });
});
