import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpConnectionPool } from "../src/mcp-client/pool.js";
import { McpConnection } from "../src/mcp-client/connection.js";

vi.mock("../src/mcp-client/connection.js", () => {
  const McpConnection = vi.fn(function (this: any) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.disconnect = vi.fn().mockResolvedValue(undefined);
    this.getClient = vi.fn();
    this.getTools = vi.fn().mockReturnValue([]);
  });
  return { McpConnection };
});

describe("McpConnectionPool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a connection on initialize", async () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    await pool.initialize();
    expect(pool.isInitialized()).toBe(true);
    expect(McpConnection).toHaveBeenCalledOnce();
    await pool.dispose();
  });

  it("reuses the same connection across acquire calls", async () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    await pool.initialize();

    const conn1 = pool.acquire();
    const conn2 = pool.acquire();
    expect(conn1).toBe(conn2);
    expect(pool.getRefCount()).toBe(2);

    pool.release();
    expect(pool.getRefCount()).toBe(1);
    pool.release();
    expect(pool.getRefCount()).toBe(0);
    await pool.dispose();
  });

  it("throws if acquire called before initialize", () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    expect(() => pool.acquire()).toThrow("Pool not initialized");
  });

  it("prevents refCount from going negative", async () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    await pool.initialize();
    pool.release();
    pool.release();
    expect(pool.getRefCount()).toBe(0);
    await pool.dispose();
  });

  it("deduplicates concurrent initialize calls", async () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    const [, ] = await Promise.all([pool.initialize(), pool.initialize()]);
    expect(McpConnection).toHaveBeenCalledOnce();
    await pool.dispose();
  });

  it("dispose resets everything", async () => {
    const pool = new McpConnectionPool("tsx", ["server.ts"]);
    await pool.initialize();
    pool.acquire();
    await pool.dispose();
    expect(pool.isInitialized()).toBe(false);
    expect(pool.getRefCount()).toBe(0);
  });
});
