import { describe, expect, it } from "vitest";
import { profileDataframe, profileDiagnostics } from "../result-profile.js";

describe("result profile", () => {
  it("classifies a single numeric row as metric cards", () => {
    const profile = profileDataframe({
      columns: [{ name: "request" }, { name: "response" }, { name: "revenue_new" }],
      rows: [[733, 688, 3.71]],
      pageInfo: { total: 1 },
    });

    expect(profile).toMatchObject({
      kind: "metrics",
      metrics: [
        { key: "request", label: "request", value: 733 },
        { key: "response", label: "response", value: 688 },
        { key: "revenue_new", label: "revenue_new", value: 3.71 },
      ],
    });
  });

  it("classifies date plus numeric rows as a time series", () => {
    const profile = profileDataframe({
      columns: [{ name: "date" }, { name: "request" }, { name: "revenue_new" }],
      rows: [
        ["2026-04-29", 120, 1.2],
        ["2026-04-30", 150, 1.5],
      ],
    });

    expect(profile).toMatchObject({
      kind: "time_series",
      xField: "date",
      yFields: ["request", "revenue_new"],
    });
  });

  it("classifies wide mixed rows as a detail table and hides low-priority id fields", () => {
    const profile = profileDataframe({
      columns: [
        { name: "date" },
        { name: "widget_id" },
        { name: "creative_id" },
        { name: "domain" },
        { name: "country" },
        { name: "request" },
        { name: "response" },
        { name: "revenue_new" },
      ],
      rows: [
        ["2026-04-30", "w1", "c1", "example.com", "US", 10, 9, 1.2],
        ["2026-04-30", "w2", "c2", "example.org", "US", 20, 18, 2.3],
      ],
    });

    expect(profile.kind).toBe("table");
    if (profile.kind === "table") {
      expect(profile.columns.find((column) => column.key === "widget_id")).toMatchObject({
        hiddenByDefault: true,
      });
      expect(profile.rows).toHaveLength(2);
    }
  });

  it("classifies failed and skipped units as diagnostics", () => {
    const profile = profileDiagnostics({
      failedResults: [{ unitId: "chart_1", error: "执行失败" }],
      skippedUnits: [{ unitId: "view_1", reason: "缺少字段元数据" }],
    });

    expect(profile).toMatchObject({
      kind: "diagnostic",
      severity: "warning",
      items: [
        { label: "chart_1", message: "执行失败" },
        { label: "view_1", message: "缺少字段元数据" },
      ],
    });
  });
});
