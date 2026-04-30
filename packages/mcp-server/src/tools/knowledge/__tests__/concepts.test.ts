import { describe, it, expect } from "vitest";
import { findConcept } from "../concepts.js";

describe("findConcept", () => {
  it("matches by primary name (case-insensitive)", () => {
    expect(findConcept("漏斗分析")?.name).toBe("漏斗分析");
    expect(findConcept("Funnel")?.name).toBe("漏斗分析");
  });

  it("matches by alias", () => {
    expect(findConcept("dashboard")?.name).toBe("看板");
    expect(findConcept("仪表盘")?.name).toBe("看板");
  });

  it("matches by partial / containment as fuzzy fallback", () => {
    expect(findConcept("看板配置")?.name).toBe("看板");
  });

  it("returns null for empty / unknown", () => {
    expect(findConcept("")).toBeNull();
    expect(findConcept("   ")).toBeNull();
    expect(findConcept("__nope__")).toBeNull();
  });
});
