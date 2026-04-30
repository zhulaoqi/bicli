import { describe, expect, it } from "vitest";
import {
  packStructuredMessageContent,
  unpackStructuredMessageContent,
} from "../session-store.js";

describe("session structured message metadata", () => {
  it("packs blocks and charts into hidden metadata and restores them without visible content", () => {
    const packed = packStructuredMessageContent("执行完成", {
      blocks: [{ id: "b1", type: "metric_cards", payload: { cards: [] } }],
      charts: [{ chartType: "line", title: "趋势" }],
    });

    expect(packed).toContain("<!--bicli_structured");

    const unpacked = unpackStructuredMessageContent(packed);
    expect(unpacked.content).toBe("执行完成");
    expect(unpacked.blocks).toEqual([{ id: "b1", type: "metric_cards", payload: { cards: [] } }]);
    expect(unpacked.charts).toEqual([{ chartType: "line", title: "趋势" }]);
  });

  it("keeps plain historical messages backward compatible", () => {
    expect(unpackStructuredMessageContent("普通历史消息")).toEqual({
      content: "普通历史消息",
      blocks: undefined,
      charts: undefined,
    });
  });
});
