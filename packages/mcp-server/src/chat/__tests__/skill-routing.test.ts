import { describe, expect, it } from "vitest";
import { routeDataEyeHelpSkill } from "../skill-routing.js";

describe("DataEye chat routing", () => {
  it("does not limit tool set when no help skill matched", () => {
    const tools = [{ name: "dataeye_analysis_list" }];
    const routed = routeDataEyeHelpSkill("我有哪些事件分析?", [], tools);

    expect(routed.skill).toBeNull();
    expect(routed.tools).toBe(tools);
  });

  it("keeps full tool set even when help skill matched", () => {
    const tools = [
      { name: "dataeye_analysis_list" },
      { name: "dataeye_analysis_execute" },
      { name: "dataeye_help_search" },
    ];
    const routed = routeDataEyeHelpSkill("留存分析是什么，顺便帮我列出我当前的留存分析", [], tools);

    expect(routed.tools).toEqual(tools);
  });
});
