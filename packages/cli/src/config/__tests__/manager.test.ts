import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigManager } from "@bicli/core";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ConfigManager", () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "bicli-test-"));
    manager = new ConfigManager(join(tmpDir, "config.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return default config when no file exists", () => {
    const config = manager.load();
    expect(config.model.provider).toBe("alibaba");
    expect(config.user.userId).toBe(1);
  });

  it("should save and reload config", () => {
    const config = manager.load();
    config.model.provider = "anthropic";
    manager.save(config);
    const reloaded = manager.load();
    expect(reloaded.model.provider).toBe("anthropic");
  });
});
