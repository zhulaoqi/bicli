import { createHash } from "node:crypto";
import type { RouteDecision } from "./agent-state.js";

export interface RouterCacheOptions {
  capacity?: number;
  ttlMs?: number;
}

export interface RouterCacheKeyInput {
  sessionId: number | string;
  userMessage: string;
  contextFingerprint?: string;
}

interface CacheEntry {
  value: RouteDecision;
  expiresAt: number;
}

/**
 * 简单 LRU + TTL 缓存：
 * - 容量满后淘汰最久未使用的 key（依赖 Map 插入顺序）。
 * - get 时若 entry 已过期，则删除并返回 undefined。
 * - set 时刷新插入顺序，确保最近使用的排在最后。
 */
export class RouterCache {
  private capacity: number;
  private ttlMs: number;
  private store = new Map<string, CacheEntry>();

  constructor(options: RouterCacheOptions = {}) {
    this.capacity = options.capacity ?? 200;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  }

  static makeKey(input: RouterCacheKeyInput): string {
    const hash = createHash("sha1");
    hash.update(String(input.sessionId));
    hash.update("|");
    hash.update(input.userMessage.trim());
    hash.update("|");
    hash.update((input.contextFingerprint ?? "").trim());
    return hash.digest("hex");
  }

  get(key: string): RouteDecision | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // 刷新 LRU 位置：删了再 set 一遍
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: RouteDecision): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
