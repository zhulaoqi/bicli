import { describe, expect, it } from "vitest";
import { buildSystemPrompt, extractFollowUps } from "../system-prompt.js";

describe("extractFollowUps", () => {
  it("extracts hidden follow up protocol", () => {
    const result = extractFollowUps('正文\n__FOLLOWUPS__["查用户数","创建用户","查看ROAS"]__END__');

    expect(result.clean).toBe("正文");
    expect(result.followUps).toEqual(["查用户数", "创建用户", "查看ROAS"]);
  });

  it("falls back to visible follow up bullet list", () => {
    const result = extractFollowUps([
      "买量监控说明正文",
      "",
      "如需我帮您：",
      "◆ 查看当前组织用户数量",
      "◆ 检查最近 5 天 ROAS 趋势",
      "◆ 创建一个新用户",
    ].join("\n"));

    expect(result.clean).toBe("买量监控说明正文");
    expect(result.followUps).toEqual([
      "查看当前组织用户数量",
      "检查最近 5 天 ROAS 趋势",
      "创建一个新用户",
    ]);
  });
});

describe("buildSystemPrompt", () => {
  it("maps user list questions to user tools, not analysis tools", () => {
    const prompt = buildSystemPrompt(
      { userId: 1, role: "admin" },
      [],
      [
        { name: "dataeye_user_list", description: "查询当前组织的成员列表" },
        { name: "dataeye_analysis_list", description: "列出当前用户可访问的已保存自助分析" },
      ],
    );

    expect(prompt).toContain("用户列表有多少用户");
    expect(prompt).toContain("不要调用 dataeye_analysis_list");
    expect(prompt).toContain("用户说\"分析一下\"只是普通动词");
  });

  it("contains page context usage rules", () => {
    const prompt = buildSystemPrompt({ userId: 1, role: "admin" }, [], []);

    expect(prompt).toContain("当前/这个图/上面数据");
    expect(prompt).toContain("优先使用页面上下文");
    expect(prompt).toContain("上下文过期");
  });
});
