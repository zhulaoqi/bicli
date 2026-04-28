import { describe, expect, it, vi } from "vitest";
import { REPAIR_PROMPT_SUFFIX, runRepairRound } from "../response-repair.js";
import type { LanguageModel, Tool } from "ai";

describe("REPAIR_PROMPT_SUFFIX", () => {
  it("is non-empty and contains key instructions", () => {
    expect(REPAIR_PROMPT_SUFFIX.length).toBeGreaterThan(10);
    expect(REPAIR_PROMPT_SUFFIX).toMatch(/先调用相关工具/);
    expect(REPAIR_PROMPT_SUFFIX).toMatch(/记忆|历史/);
  });
});

describe("runRepairRound", () => {
  it("returns null immediately when no tools available", async () => {
    const result = await runRepairRound({
      llm: {} as LanguageModel,
      systemPrompt: "test",
      messages: [],
      aiTools: {},
    });
    expect(result).toBeNull();
  });

  it("returns null and logs when generateText throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runRepairRound({
      llm: {} as LanguageModel,
      systemPrompt: "test",
      messages: [{ role: "user", content: "我有哪些分析" }],
      aiTools: { dummy_tool: {} as Tool<any, any> },
      timeoutMs: 5000,
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[repair\]/),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it("times out and returns null after timeoutMs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock generateText to hang forever
    vi.doMock("ai", async (importOriginal) => {
      const original = await importOriginal<typeof import("ai")>();
      return {
        ...original,
        generateText: () => new Promise(() => {}), // never resolves
      };
    });

    const result = await runRepairRound({
      llm: {} as LanguageModel,
      systemPrompt: "test",
      messages: [],
      aiTools: { dummy: {} as Tool<any, any> },
      timeoutMs: 50,
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
    vi.resetModules();
  });
});
