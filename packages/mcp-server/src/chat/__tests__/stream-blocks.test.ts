import { describe, expect, it } from "vitest";
import { extractStructuredToolArtifacts } from "../message-blocks.js";

describe("stream structured tool artifacts", () => {
  it("extracts message blocks and strips them from the LLM payload", () => {
    const raw = JSON.stringify({
      success: true,
      data: {
        summary: { total: 1 },
        __blocks__: [{ id: "b1", type: "metric_cards", payload: { cards: [] } }],
      },
    });

    const extracted = extractStructuredToolArtifacts(raw);

    expect(extracted.blocks).toEqual([{ id: "b1", type: "metric_cards", payload: { cards: [] } }]);
    expect(extracted.chart).toBeUndefined();
    expect(extracted.resultForLLM).toBe(JSON.stringify({ success: true, data: { summary: { total: 1 } } }));
  });

  it("extracts blocks and legacy chart payloads independently", () => {
    const raw = JSON.stringify({
      success: true,
      data: {
        __blocks__: [{ id: "b1", type: "chart", payload: { chartType: "line" } }],
        __chart__: { chartType: "line", title: "趋势", xAxis: ["2026-04-30"], series: [] },
      },
    });

    const extracted = extractStructuredToolArtifacts(raw);

    expect(extracted.blocks).toHaveLength(1);
    expect(extracted.chart).toEqual({ chartType: "line", title: "趋势", xAxis: ["2026-04-30"], series: [] });
    expect(extracted.resultForLLM).toBe(JSON.stringify({ success: true, data: {} }));
  });

  it("documents that stream tools must return strings", () => {
    const result = extractStructuredToolArtifacts({ success: true, data: { __blocks__: [] } } as unknown as string);

    expect(result).toEqual({
      blocks: [],
      resultForLLM: { success: true, data: { __blocks__: [] } },
    });
  });
});
