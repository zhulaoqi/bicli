import { describe, expect, it } from "vitest";
import { filterProductsByKeyword } from "../dataeye-project-list.js";
import { normalizeAnalysisListResult } from "../dataeye-analysis-list.js";

describe("DataEye list normalization", () => {
  it("filters products locally when product API has no keyword parameter", () => {
    const products = [
      { id: 1, name: "CGT 网赚", projectId: 10 },
      { id: 2, name: "WGT 投放", projectId: 20 },
    ];

    expect(filterProductsByKeyword(products, "wgt")).toEqual([
      expect.objectContaining({ id: 2, matchedBy: "local_name" }),
    ]);
  });

  it("keeps analysis project/product ids and navigation metadata", () => {
    const normalized = normalizeAnalysisListResult({
      records: [
        {
          id: 101,
          name: "登录趋势",
          type: 1,
          projectId: 10,
          projectName: "WGT",
          productId: 20,
          productName: "WGT iOS",
          createBy: "kinch",
          represent: null,
          updateTime: "2026-05-21",
          isFavorites: false,
        },
      ],
      total: 1,
      current: 1,
      pages: 1,
    });

    expect(normalized.analyses[0]).toMatchObject({
      id: 101,
      projectId: 10,
      productId: 20,
      navigation: {
        projectId: 10,
        productId: 20,
        analysisId: 101,
        type: 1,
      },
    });
  });
});
