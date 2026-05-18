import { describe, expect, it } from "vitest";
import {
  isNumericDataSourceId,
  looksLikeOpaqueUuid,
  normalizeNumericSourceId,
} from "../sql-source-id.js";

describe("sql-source-id", () => {
  it("accepts numeric source ids", () => {
    expect(normalizeNumericSourceId(42)).toBe(42);
    expect(normalizeNumericSourceId("10086")).toBe(10086);
    expect(isNumericDataSourceId("001")).toBe(true);
  });

  it("rejects uuid-like ids", () => {
    expect(normalizeNumericSourceId("8b2d81b5f1704817a467e54d3d559786")).toBeNull();
    expect(looksLikeOpaqueUuid("8b2d81b5f1704817a467e54d3d559786")).toBe(true);
  });
});
