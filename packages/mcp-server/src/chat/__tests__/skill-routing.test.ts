import { describe, expect, it } from "vitest";
import { routeDataEyeHelpSkill } from "../skill-routing.js";

describe("DataEye chat routing", () => {
  it("does not limit tool set when no help skill matched", () => {
    const tools = [{ name: "dataeye_analysis_list" }];
    const routed = routeDataEyeHelpSkill("你好，先不用查询数据", [], tools);

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

  it("routes DataEye business workflow skills, not only help-center skills", () => {
    const tools = [
      { name: "dataeye_user_onboard" },
      { name: "dataeye_user_create" },
    ];
    const routed = routeDataEyeHelpSkill("帮我创建一个用户 analyst@example.com 并分配数据分析师角色", [], tools);

    expect(routed.tools).toEqual(tools);
    expect(routed.skill?.name).toBe("dataeye-user-onboarding");
    expect(routed.skillPrompt).toContain("dataeye_user_onboard");
  });
});
