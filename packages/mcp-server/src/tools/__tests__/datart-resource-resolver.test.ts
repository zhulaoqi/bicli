import { describe, expect, it } from "vitest";
import { resolveDashboardRefFromCandidates } from "../datart-resource-resolver.js";

const candidates = [
  {
    id: "1234567890abcdef1234567890abcdef",
    name: "WGT-Widget-创意分析看板",
    folderId: "53cdbb0d",
    parentId: "folder_parent",
  },
  {
    id: "abcdefabcdefabcdefabcdefabcdefab",
    name: "DSP-整体销售趋势分析看板",
    folderId: "folder_2",
  },
  {
    id: "abcdef11111111111111111111111111",
    name: "DSP-销售明细看板",
    folderId: "folder_3",
  },
];

describe("resolveDashboardRefFromCandidates", () => {
  it("uses relId as executable dashboard id and does not resolve folderId", () => {
    expect(resolveDashboardRefFromCandidates("1234567890abcdef1234567890abcdef", candidates)).toEqual({
      resolved: true,
      matchedBy: "id",
      resource: candidates[0],
    });

    expect(resolveDashboardRefFromCandidates("53cdbb0d", candidates)).toMatchObject({
      resolved: false,
      code: "NOT_FOUND",
    });
  });

  it("resolves exact and case-insensitive names", () => {
    expect(resolveDashboardRefFromCandidates("WGT-Widget-创意分析看板", candidates)).toMatchObject({
      resolved: true,
      matchedBy: "name",
      resource: { id: "1234567890abcdef1234567890abcdef" },
    });

    expect(resolveDashboardRefFromCandidates("dsp-整体销售趋势分析看板", candidates)).toMatchObject({
      resolved: true,
      matchedBy: "name",
      resource: { id: "abcdefabcdefabcdefabcdefabcdefab" },
    });
  });

  it("blocks duplicate exact names instead of picking the first match", () => {
    expect(resolveDashboardRefFromCandidates("重复资源", [
      { id: "11111111111111111111111111111111", name: "重复资源", folderId: "folder_a" },
      { id: "22222222222222222222222222222222", name: "重复资源", folderId: "folder_b" },
    ])).toMatchObject({
      resolved: false,
      code: "AMBIGUOUS_RESOURCE",
      candidates: [
        { id: "11111111111111111111111111111111" },
        { id: "22222222222222222222222222222222" },
      ],
    });
  });

  it("resolves unique executable id prefixes but blocks ambiguous prefixes", () => {
    expect(resolveDashboardRefFromCandidates("12345678", candidates)).toMatchObject({
      resolved: true,
      matchedBy: "prefix",
      resource: { id: "1234567890abcdef1234567890abcdef" },
    });

    expect(resolveDashboardRefFromCandidates("abcdef", candidates)).toMatchObject({
      resolved: false,
      code: "AMBIGUOUS_RESOURCE",
      candidates: [candidates[1], candidates[2]],
    });
  });

  it("returns NOT_FOUND when no candidate matches", () => {
    expect(resolveDashboardRefFromCandidates("不存在的看板", candidates)).toMatchObject({
      resolved: false,
      code: "NOT_FOUND",
    });
  });
});
