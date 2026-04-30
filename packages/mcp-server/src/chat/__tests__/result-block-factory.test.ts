import { describe, expect, it } from "vitest";
import {
  createBlocksFromProfile,
  createSummaryBlock,
} from "../result-block-factory.js";
import type { ResultProfile } from "../result-profile.js";

describe("result block factory", () => {
  it("creates metric cards from metrics profiles", () => {
    const profile: ResultProfile = {
      kind: "metrics",
      metrics: [
        { key: "request", label: "request", value: 733 },
        { key: "revenue_new", label: "revenue_new", value: 3.71, unit: "$" },
      ],
      table: { columns: [], rows: [], total: 1 },
    };

    expect(createBlocksFromProfile(profile, { title: "核心指标", sourceTool: "tool_a" })).toMatchObject([
      {
        type: "metric_cards",
        title: "核心指标",
        sourceTool: "tool_a",
        payload: {
          cards: [
            { key: "request", label: "request", value: 733 },
            { key: "revenue_new", label: "revenue_new", value: 3.71, unit: "$" },
          ],
        },
      },
    ]);
  });

  it("creates line chart blocks from time series profiles", () => {
    const profile: ResultProfile = {
      kind: "time_series",
      xField: "date",
      yFields: ["request", "response"],
      table: {
        columns: [],
        rows: [
          { date: "2026-04-29", request: 10, response: 9 },
          { date: "2026-04-30", request: 12, response: 11 },
        ],
        total: 2,
      },
    };

    expect(createBlocksFromProfile(profile, { title: "趋势" })[0]).toMatchObject({
      type: "chart",
      payload: {
        chartType: "line",
        xField: "date",
        yFields: ["request", "response"],
        categories: ["2026-04-29", "2026-04-30"],
        series: [
          { name: "request", data: [10, 12] },
          { name: "response", data: [9, 11] },
        ],
      },
    });
  });

  it("creates warning blocks from diagnostic profiles", () => {
    const profile: ResultProfile = {
      kind: "diagnostic",
      severity: "warning",
      items: [{ label: "chart_1", message: "执行失败" }],
    };

    expect(createBlocksFromProfile(profile, { title: "执行诊断" })[0]).toMatchObject({
      type: "warning",
      title: "执行诊断",
      payload: {
        severity: "warning",
        message: "部分结果需要关注",
        details: ["chart_1：执行失败"],
      },
    });
  });

  it("creates truncated table blocks from table profiles", () => {
    const profile: ResultProfile = {
      kind: "table",
      columns: [
        { key: "widget_id", title: "widget_id", dataType: "id", hiddenByDefault: true },
        { key: "request", title: "request", dataType: "number" },
      ],
      rows: Array.from({ length: 20 }, (_, index) => ({ widget_id: `w${index}`, request: index })),
      total: 20,
    };

    const block = createBlocksFromProfile(profile, { title: "明细表", maxRows: 5 })[0];
    expect(block).toMatchObject({
      type: "table",
      title: "明细表",
      payload: {
        total: 20,
        truncated: true,
      },
    });
    expect((block.payload as any).rows).toHaveLength(5);
    expect((block.payload as any).columns[0]).toMatchObject({ hiddenByDefault: true });
  });

  it("creates summary blocks", () => {
    expect(createSummaryBlock({
      title: "执行摘要",
      items: [
        { label: "成功组件", value: 1, tone: "success" },
        { label: "失败组件", value: 2, tone: "warning" },
      ],
    })).toMatchObject({
      type: "summary",
      title: "执行摘要",
      payload: {
        items: [
          { label: "成功组件", value: 1, tone: "success" },
          { label: "失败组件", value: 2, tone: "warning" },
        ],
      },
    });
  });
});
