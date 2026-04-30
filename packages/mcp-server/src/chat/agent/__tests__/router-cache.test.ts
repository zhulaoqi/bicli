import { describe, expect, it, vi } from "vitest";
import { RouterCache } from "../router-cache.js";
import { runRouter } from "../intent-router.js";

describe("RouterCache", () => {
  it("returns undefined for missing key", () => {
    const c = new RouterCache({ capacity: 3, ttlMs: 1000 });
    expect(c.get("x")).toBeUndefined();
  });

  it("stores and reads back values", () => {
    const c = new RouterCache({ capacity: 3, ttlMs: 1000 });
    c.set("k1", { v: 1 } as any);
    expect(c.get("k1")).toEqual({ v: 1 });
  });

  it("expires entries after ttl", async () => {
    const c = new RouterCache({ capacity: 3, ttlMs: 5 });
    c.set("k1", { v: 1 } as any);
    await new Promise((r) => setTimeout(r, 15));
    expect(c.get("k1")).toBeUndefined();
  });

  it("evicts least-recently-used entries beyond capacity", () => {
    const c = new RouterCache({ capacity: 2, ttlMs: 60_000 });
    c.set("a", { v: "a" } as any);
    c.set("b", { v: "b" } as any);
    expect(c.get("a")).toEqual({ v: "a" }); // touch a → b is now LRU
    c.set("c", { v: "c" } as any); // should evict b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toEqual({ v: "a" });
    expect(c.get("c")).toEqual({ v: "c" });
  });

  it("computes deterministic key for same sessionId+userMessage", () => {
    const k1 = RouterCache.makeKey({ sessionId: 1, userMessage: "查询定时任务列表" });
    const k2 = RouterCache.makeKey({ sessionId: 1, userMessage: "查询定时任务列表" });
    const k3 = RouterCache.makeKey({ sessionId: 2, userMessage: "查询定时任务列表" });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

describe("runRouter cache integration", () => {
  it("hits cache on second identical call within same session, never invokes LLM", async () => {
    const llm = vi.fn().mockResolvedValue({ route: "knowledge" });
    const cache = new RouterCache({ capacity: 10, ttlMs: 60_000 });
    const sessionId = 99;
    const userMessage = "查一下定时任务列表";
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];

    const first = await runRouter(
      { userMessage, history, pageContextEvidence: false },
      { llm, allowOverride: true, cache, sessionId },
    );
    const second = await runRouter(
      { userMessage, history, pageContextEvidence: false },
      { llm, allowOverride: true, cache, sessionId },
    );

    const { reasoning: r1, ...rest1 } = first;
    const { reasoning: r2, ...rest2 } = second;
    expect(rest2).toEqual(rest1);
    expect(r2.startsWith("cache:")).toBe(true);
    // 第一次决策本身不带 cache 前缀
    expect(r1.startsWith("cache:")).toBe(false);
  });

  it("does not share cache across different sessions", async () => {
    const llm = vi.fn();
    const cache = new RouterCache({ capacity: 10, ttlMs: 60_000 });
    const userMessage = "查一下定时任务列表";
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];

    const a = await runRouter(
      { userMessage, history, pageContextEvidence: false },
      { cache, sessionId: 1 },
    );
    const b = await runRouter(
      { userMessage, history, pageContextEvidence: false },
      { cache, sessionId: 2 },
    );
    expect(a.reasoning.startsWith("cache:")).toBe(false);
    expect(b.reasoning.startsWith("cache:")).toBe(false);
    expect(llm).not.toHaveBeenCalled();
  });
});
