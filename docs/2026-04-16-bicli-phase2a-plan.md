# BiCLI Phase 2a 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CLI 核心逻辑抽离为 @bicli/core，实现模型管理、斜杠命令、三层权限体系和流式输出。

**Architecture:** 从 @bicli/cli 抽取业务逻辑到 @bicli/core（无头引擎），CLI 只保留 TUI 渲染。MCP Server 扩展 _meta 权限元数据、self_permissions 工具和 data_scope_rules 表。Core 提供 BiCLIEngine 统一入口，通过 AsyncGenerator 输出流式事件。

**Tech Stack:** TypeScript 6.x, pnpm workspace, Vercel AI SDK v6 (`streamText`), MCP SDK 1.29, Drizzle ORM, Ink 7 (TUI), Vitest 4

**Spec:** `docs/2026-04-16-bicli-phase2-design.md` v2.1

---

## Chunk 1: Core 包骨架 + 代码迁移

### Task 1: 创建 @bicli/core 包骨架

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/types.ts`

- [ ] **Step 1: 创建 core 包目录和 package.json**

```bash
mkdir -p packages/core/src
```

`packages/core/package.json`:
```json
{
  "name": "@bicli/core",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-sdk/alibaba": "^1.0.17",
    "@ai-sdk/anthropic": "^3.0.69",
    "@ai-sdk/openai": "^3.0.53",
    "@bicli/skills": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "ai": "^6.0.162",
    "dotenv": "^16.6.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22.19.17"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建入口文件和类型定义**

`packages/core/src/types.ts`:
```typescript
export interface ToolContext {
  userId: number;
  role: string;
}

export interface ChatEvent {
  type: "text_delta" | "tool_call_start" | "tool_call_end" | "error" | "done";
  content?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  message?: string;
  fullText?: string;
}

export interface EngineStatus {
  connected: boolean;
  model: string;
  role: string;
  toolCount: number;
  permissionCount: number;
}

export interface ToolInfo {
  name: string;
  description: string;
  requiredPermissions?: string[];
}
```

`packages/core/src/index.ts`（初始骨架，后续 Task 逐步填充）:
```typescript
export type { ChatEvent, EngineStatus, ToolInfo, ToolContext } from "./types.js";
```

- [ ] **Step 4: 安装依赖**

Run: `pnpm install`

Expected: 成功安装，`packages/core/node_modules` 出现

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd packages/core && npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat(core): scaffold @bicli/core package"
```

---

### Task 2: 迁移 config/llm/mcp-client/skill-loader/session 到 core

**Files:**
- Move: `packages/cli/src/config/manager.ts` → `packages/core/src/config/manager.ts`
- Move: `packages/cli/src/llm/provider.ts` → `packages/core/src/llm/provider.ts`
- Move: `packages/cli/src/llm/session.ts` → `packages/core/src/llm/session.ts`
- Move: `packages/cli/src/llm/tool-caller.ts` → `packages/core/src/llm/tool-caller.ts`
- Move: `packages/cli/src/llm/providers/` → `packages/core/src/llm/providers/`
- Move: `packages/cli/src/mcp-client/connection.ts` → `packages/core/src/mcp-client/connection.ts`
- Move: `packages/cli/src/skill-loader/matcher.ts` → `packages/core/src/skill-loader/matcher.ts`
- Move: `packages/cli/src/skill-loader/injector.ts` → `packages/core/src/skill-loader/injector.ts`
- Modify: `packages/cli/package.json` — 添加 `@bicli/core` 依赖，移除迁出的直接依赖
- Modify: `packages/cli/src/commands/chat.ts` — import 改为从 `@bicli/core` 引入
- Modify: `packages/cli/src/commands/config-cmd.ts` — import 改为从 `@bicli/core` 引入
- Modify: `packages/core/src/index.ts` — 重新导出所有迁入模块

- [ ] **Step 1: 创建目录结构并移动文件**

```bash
mkdir -p packages/core/src/{config,llm/providers,mcp-client,skill-loader}
cp packages/cli/src/config/manager.ts packages/core/src/config/manager.ts
cp packages/cli/src/llm/provider.ts packages/core/src/llm/provider.ts
cp packages/cli/src/llm/session.ts packages/core/src/llm/session.ts
cp packages/cli/src/llm/tool-caller.ts packages/core/src/llm/tool-caller.ts
cp packages/cli/src/llm/providers/qwen.ts packages/core/src/llm/providers/qwen.ts
cp packages/cli/src/llm/providers/openai.ts packages/core/src/llm/providers/openai.ts
cp packages/cli/src/llm/providers/anthropic.ts packages/core/src/llm/providers/anthropic.ts
cp packages/cli/src/mcp-client/connection.ts packages/core/src/mcp-client/connection.ts
cp packages/cli/src/skill-loader/matcher.ts packages/core/src/skill-loader/matcher.ts
cp packages/cli/src/skill-loader/injector.ts packages/core/src/skill-loader/injector.ts
```

- [ ] **Step 2: 更新 core/src/index.ts 导出**

`packages/core/src/index.ts`:
```typescript
export type { ChatEvent, EngineStatus, ToolInfo, ToolContext } from "./types.js";
export { ConfigManager, getProviderEnvKey, getAvailableProviders } from "./config/manager.js";
export type { ProviderName, ModelConfig, BiCliConfig } from "./config/manager.js";
export { createModel } from "./llm/provider.js";
export { Session } from "./llm/session.js";
export { ToolCaller } from "./llm/tool-caller.js";
export type { ToolCallerConfig } from "./llm/tool-caller.js";
export { McpConnection } from "./mcp-client/connection.js";
export { SkillMatcher } from "./skill-loader/matcher.js";
export { buildSystemPrompt, filterTools } from "./skill-loader/injector.js";
```

- [ ] **Step 3: 更新 CLI 的 package.json，添加 core 依赖**

在 `packages/cli/package.json` 的 `dependencies` 中添加 `"@bicli/core": "workspace:*"`。

移除 CLI 不再直接需要的依赖（它们现在由 core 提供）：
`@ai-sdk/alibaba`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai` — 这些改为 core 的依赖。

CLI 保留：`commander`, `dotenv`, `ink`, `react`, `zod`, `@bicli/skills`（用于类型），`@modelcontextprotocol/sdk`（用于 Tool 类型）。

新的 `packages/cli/package.json` dependencies 部分：
```json
{
  "dependencies": {
    "@bicli/core": "workspace:*",
    "@bicli/skills": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "commander": "^14.0.3",
    "dotenv": "^16.6.1",
    "ink": "^7.0.0",
    "react": "^19.2.5",
    "zod": "^3.25.76"
  }
}
```

- [ ] **Step 4: 更新 chat.ts 的 import 路径**

`packages/cli/src/commands/chat.ts` — 将所有从本地路径的 import 改为从 `@bicli/core`：

旧:
```typescript
import { ConfigManager, getProviderEnvKey, type ProviderName } from "../config/manager.js";
import { McpConnection } from "../mcp-client/connection.js";
import { createModel } from "../llm/provider.js";
import { ToolCaller } from "../llm/tool-caller.js";
import { SkillMatcher } from "../skill-loader/matcher.js";
import { buildSystemPrompt, filterTools } from "../skill-loader/injector.js";
```

新:
```typescript
import {
  ConfigManager,
  getProviderEnvKey,
  type ProviderName,
  McpConnection,
  createModel,
  ToolCaller,
  SkillMatcher,
  buildSystemPrompt,
  filterTools,
} from "@bicli/core";
```

- [ ] **Step 5: 更新 config-cmd.ts 的 import 路径**

`packages/cli/src/commands/config-cmd.ts` — 同样改为从 `@bicli/core` 引入 `ConfigManager`, `getAvailableProviders`。

- [ ] **Step 6: 删除 CLI 中已迁移的源文件**

```bash
rm -rf packages/cli/src/config/manager.ts
rm -rf packages/cli/src/llm/
rm -rf packages/cli/src/mcp-client/
rm -rf packages/cli/src/skill-loader/matcher.ts
rm -rf packages/cli/src/skill-loader/injector.ts
```

保留 `packages/cli/src/config/` 目录（可能还有 `__tests__`），测试文件后续迁到 core。

- [ ] **Step 7: 运行 pnpm install 更新依赖**

Run: `pnpm install`

- [ ] **Step 8: 验证 TypeScript 编译**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json && npx tsc --noEmit -p packages/cli/tsconfig.json`

Expected: 0 errors in both

- [ ] **Step 9: 验证一期功能不回退**

Run: `npx tsx packages/cli/bin/bicli.ts mcp status`

Expected: 输出 MCP Server connected + 11 tools

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: migrate core logic from @bicli/cli to @bicli/core"
```

---

## Chunk 2: 模型管理 + 自定义模型 + 斜杠命令

### Task 3: 实现 ModelRegistry

**Files:**
- Create: `packages/core/src/model-registry/index.ts`
- Create: `packages/core/src/model-registry/types.ts`
- Create: `packages/core/src/model-registry/__tests__/model-registry.test.ts`
- Modify: `packages/core/src/index.ts` — 导出 ModelRegistry
- Modify: `packages/core/src/config/manager.ts` — 移除 model 字段相关逻辑

- [ ] **Step 1: 定义 ModelRegistry 类型**

`packages/core/src/model-registry/types.ts`:
```typescript
export interface ModelEntry {
  id: string;
  name: string;
  provider: "alibaba" | "openai" | "anthropic" | "custom";
  model: string;
  builtin: boolean;
  endpoint?: string;
  apiKey?: string;
}

export interface ModelsConfig {
  current: string;
  models: ModelEntry[];
}

export interface ModelDisplayInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  missingEnvKey?: string;
}
```

- [ ] **Step 2: 编写 ModelRegistry 测试**

`packages/core/src/model-registry/__tests__/model-registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelRegistry } from "../index.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ModelRegistry", () => {
  let tmpDir: string;
  let registry: ModelRegistry;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bicli-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    registry = new ModelRegistry(join(tmpDir, "models.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create default models.json if not exists", () => {
    const data = registry.load();
    expect(data.models.length).toBeGreaterThanOrEqual(4);
    expect(data.current).toBe("qwen-plus");
    expect(existsSync(join(tmpDir, "models.json"))).toBe(true);
  });

  it("should switch model by id", () => {
    registry.load();
    const result = registry.switchTo("qwen-max");
    expect(result.id).toBe("qwen-max");
    const reloaded = registry.load();
    expect(reloaded.current).toBe("qwen-max");
  });

  it("should switch model by 1-based index", () => {
    registry.load();
    const result = registry.switchTo(2);
    expect(result.id).toBe("qwen-max");
  });

  it("should throw on invalid model id", () => {
    registry.load();
    expect(() => registry.switchTo("nonexistent")).toThrow();
  });

  it("should fallback to first model if current is invalid", () => {
    writeFileSync(join(tmpDir, "models.json"), JSON.stringify({
      current: "deleted-model",
      models: [{ id: "qwen-plus", name: "QP", provider: "alibaba", model: "qwen-plus", builtin: true }],
    }));
    const data = registry.load();
    expect(data.current).toBe("qwen-plus");
  });

  it("should resolve env: prefix in apiKey", () => {
    process.env.TEST_KEY_123 = "sk-test";
    const key = registry.resolveApiKey("env:TEST_KEY_123");
    expect(key).toBe("sk-test");
    delete process.env.TEST_KEY_123;
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `pnpm --filter @bicli/core test`

Expected: FAIL（ModelRegistry 还不存在）

- [ ] **Step 4: 实现 ModelRegistry**

`packages/core/src/model-registry/index.ts`:
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ModelEntry, ModelsConfig, ModelDisplayInfo } from "./types.js";

const PROVIDER_ENV_KEYS: Record<string, string> = {
  alibaba: "ALIBABA_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const BUILTIN_MODELS: ModelEntry[] = [
  { id: "qwen-plus", name: "通义千问 Plus", provider: "alibaba", model: "qwen-plus", builtin: true },
  { id: "qwen-max", name: "通义千问 Max", provider: "alibaba", model: "qwen-max", builtin: true },
  { id: "gpt-4", name: "GPT-4", provider: "openai", model: "gpt-4", builtin: true },
  { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-20250514", builtin: true },
];

export class ModelRegistry {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), ".bicli", "models.json");
  }

  load(): ModelsConfig {
    if (!existsSync(this.configPath)) {
      const defaults = this.createDefaults();
      this.save(defaults);
      return defaults;
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const data: ModelsConfig = JSON.parse(raw);

      if (!data.models || data.models.length === 0) {
        const defaults = this.createDefaults();
        this.save(defaults);
        return defaults;
      }

      const currentExists = data.models.some(m => m.id === data.current);
      if (!currentExists) {
        data.current = data.models[0].id;
        this.save(data);
      }

      return data;
    } catch {
      const defaults = this.createDefaults();
      this.save(defaults);
      return defaults;
    }
  }

  getCurrent(): ModelEntry {
    const data = this.load();
    return data.models.find(m => m.id === data.current)!;
  }

  switchTo(idOrIndex: string | number): ModelEntry {
    const data = this.load();
    const target = typeof idOrIndex === "number"
      ? data.models[idOrIndex - 1]
      : data.models.find(m => m.id === idOrIndex);
    if (!target) {
      throw new Error(`模型 "${idOrIndex}" 不存在。使用 /model 查看可用列表。`);
    }
    data.current = target.id;
    this.save(data);
    return target;
  }

  addModel(entry: Omit<ModelEntry, "builtin">): ModelEntry {
    const data = this.load();
    if (data.models.some(m => m.id === entry.id)) {
      throw new Error(`模型 ID "${entry.id}" 已存在`);
    }
    const model: ModelEntry = { ...entry, builtin: false };
    data.models.push(model);
    this.save(data);
    return model;
  }

  removeModel(id: string): void {
    const data = this.load();
    const model = data.models.find(m => m.id === id);
    if (!model) throw new Error(`模型 "${id}" 不存在`);
    if (model.builtin) throw new Error(`内置模型 "${id}" 不可删除`);
    data.models = data.models.filter(m => m.id !== id);
    if (data.current === id) {
      data.current = data.models[0]?.id ?? "qwen-plus";
    }
    this.save(data);
  }

  getDisplayList(): ModelDisplayInfo[] {
    const data = this.load();
    return data.models.map(m => {
      const envKey = PROVIDER_ENV_KEYS[m.provider];
      const hasKey = m.provider === "custom"
        ? !!m.apiKey
        : envKey ? !!process.env[envKey] : true;
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        available: hasKey,
        missingEnvKey: hasKey ? undefined : envKey,
      };
    });
  }

  resolveApiKey(value: string): string {
    if (value.startsWith("env:")) {
      const envName = value.slice(4);
      return process.env[envName] || "";
    }
    return value;
  }

  private save(data: ModelsConfig): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(data, null, 2), "utf-8");
  }

  private createDefaults(): ModelsConfig {
    return { current: "qwen-plus", models: [...BUILTIN_MODELS] };
  }
}

export type { ModelEntry, ModelsConfig, ModelDisplayInfo } from "./types.js";
```

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm --filter @bicli/core test`

Expected: All tests PASS

- [ ] **Step 6: 更新 core/src/index.ts 导出 ModelRegistry**

在 `packages/core/src/index.ts` 添加:
```typescript
export { ModelRegistry } from "./model-registry/index.js";
export type { ModelEntry, ModelsConfig, ModelDisplayInfo } from "./model-registry/types.js";
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): implement ModelRegistry with models.json management"
```

---

### Task 4: 新增 custom provider

**Files:**
- Create: `packages/core/src/llm/providers/custom.ts`
- Modify: `packages/core/src/llm/provider.ts` — 添加 custom 分支

- [ ] **Step 1: 创建 custom provider**

`packages/core/src/llm/providers/custom.ts`:
```typescript
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface CustomModelConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export function createCustomProvider(config: CustomModelConfig): LanguageModel {
  const provider = createOpenAI({
    baseURL: config.endpoint,
    apiKey: config.apiKey,
  });
  return provider(config.model);
}
```

- [ ] **Step 2: 更新 provider.ts 添加 custom 分支**

修改 `packages/core/src/llm/provider.ts`：

```typescript
import type { LanguageModel } from "ai";
import type { ProviderName } from "../config/manager.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createQwenProvider } from "./providers/qwen.js";
import { createCustomProvider, type CustomModelConfig } from "./providers/custom.js";

export type { ProviderName };
export type ExtendedProvider = ProviderName | "custom";

export function createModel(provider: ExtendedProvider, modelId: string, customConfig?: CustomModelConfig): LanguageModel {
  switch (provider) {
    case "openai": return createOpenAIProvider(modelId);
    case "anthropic": return createAnthropicProvider(modelId);
    case "alibaba": return createQwenProvider(modelId);
    case "custom": {
      if (!customConfig) throw new Error("Custom provider requires endpoint and apiKey");
      return createCustomProvider(customConfig);
    }
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
```

- [ ] **Step 3: 更新 index.ts 导出**

添加到 `packages/core/src/index.ts`:
```typescript
export type { CustomModelConfig } from "./llm/providers/custom.js";
export type { ExtendedProvider } from "./llm/provider.js";
```

- [ ] **Step 4: 验证编译**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json`

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add custom OpenAI-compatible provider"
```

---

### Task 5: 实现斜杠命令解析器和处理器

**Files:**
- Create: `packages/core/src/slash-commands/parser.ts`
- Create: `packages/core/src/slash-commands/types.ts`
- Create: `packages/core/src/slash-commands/handler.ts`
- Create: `packages/core/src/slash-commands/__tests__/parser.test.ts`
- Create: `packages/core/src/slash-commands/__tests__/handler.test.ts`
- Modify: `packages/core/src/index.ts` — 导出斜杠命令模块

- [ ] **Step 1: 创建类型定义**

`packages/core/src/slash-commands/types.ts`:
```typescript
import type { ModelDisplayInfo } from "../model-registry/types.js";

export interface SlashCommand {
  name: string;
  args: string[];
  raw: string;
}

export type SlashCommandResult =
  | { type: "model_list"; models: ModelDisplayInfo[]; current: string }
  | { type: "model_switched"; from: string; to: ModelDisplayInfo }
  | { type: "model_add_guide"; platform: "tui" | "web"; template?: string }
  | { type: "model_removed"; id: string }
  | { type: "role_info"; role: string; permissions: string[]; availableTools: string[] }
  | { type: "tools_list"; tools: Array<{ name: string; description: string }> }
  | { type: "cleared" }
  | { type: "help"; commands: Array<{ command: string; description: string }> }
  | { type: "error"; message: string };
```

- [ ] **Step 2: 编写 parser 测试**

`packages/core/src/slash-commands/__tests__/parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseSlashCommand, isSlashCommand } from "../parser.js";

describe("parseSlashCommand", () => {
  it("should parse /model", () => {
    const result = parseSlashCommand("/model");
    expect(result).toEqual({ name: "model", args: [], raw: "/model" });
  });

  it("should parse /model qwen-max", () => {
    const result = parseSlashCommand("/model qwen-max");
    expect(result).toEqual({ name: "model", args: ["qwen-max"], raw: "/model qwen-max" });
  });

  it("should parse /model add", () => {
    const result = parseSlashCommand("/model add");
    expect(result).toEqual({ name: "model", args: ["add"], raw: "/model add" });
  });

  it("should return null for non-slash input", () => {
    expect(parseSlashCommand("查询用户")).toBeNull();
  });

  it("should trim whitespace", () => {
    const result = parseSlashCommand("  /help  ");
    expect(result).toEqual({ name: "help", args: [], raw: "/help" });
  });
});

describe("isSlashCommand", () => {
  it("should detect slash commands", () => {
    expect(isSlashCommand("/model")).toBe(true);
    expect(isSlashCommand("  /help")).toBe(true);
    expect(isSlashCommand("查询用户")).toBe(false);
    expect(isSlashCommand("")).toBe(false);
  });
});
```

- [ ] **Step 3: 实现 parser**

`packages/core/src/slash-commands/parser.ts`:
```typescript
import type { SlashCommand } from "./types.js";

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  return {
    name: parts[0],
    args: parts.slice(1),
    raw: trimmed,
  };
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}
```

- [ ] **Step 4: 运行 parser 测试**

Run: `pnpm --filter @bicli/core test`

Expected: parser tests PASS

- [ ] **Step 5: 实现 handler**

`packages/core/src/slash-commands/handler.ts`:
```typescript
import type { SlashCommand, SlashCommandResult } from "./types.js";
import type { ModelRegistry } from "../model-registry/index.js";
import type { Session } from "../llm/session.js";
import type { ToolInfo } from "../types.js";

export interface SlashCommandContext {
  modelRegistry: ModelRegistry;
  session: Session;
  role: string;
  permissions: string[];
  availableTools: ToolInfo[];
  platform: "tui" | "web";
  refreshPermissions: () => Promise<string[]>;
}

const HELP_COMMANDS = [
  { command: "/model", description: "显示可用模型列表，输入编号切换" },
  { command: "/model <id>", description: "快速切换到指定模型" },
  { command: "/model add", description: "添加自定义模型" },
  { command: "/model remove <id>", description: "删除自定义模型" },
  { command: "/role", description: "查看当前角色和权限（只读）" },
  { command: "/tools", description: "显示当前可用的工具列表" },
  { command: "/clear", description: "清空对话历史" },
  { command: "/help", description: "显示本帮助信息" },
];

export async function handleSlashCommand(
  cmd: SlashCommand,
  ctx: SlashCommandContext
): Promise<SlashCommandResult> {
  switch (cmd.name) {
    case "model":
      return handleModelCommand(cmd.args, ctx);
    case "role":
      return handleRoleCommand(ctx);
    case "tools":
      return handleToolsCommand(ctx);
    case "clear":
      ctx.session.clear();
      return { type: "cleared" };
    case "help":
      return { type: "help", commands: HELP_COMMANDS };
    default:
      return { type: "error", message: `未知命令: /${cmd.name}。输入 /help 查看可用命令。` };
  }
}

function handleModelCommand(args: string[], ctx: SlashCommandContext): SlashCommandResult {
  if (args.length === 0) {
    const models = ctx.modelRegistry.getDisplayList();
    const current = ctx.modelRegistry.getCurrent();
    return { type: "model_list", models, current: current.id };
  }

  if (args[0] === "add") {
    if (ctx.platform === "tui") {
      const template = JSON.stringify({
        id: "my-model",
        name: "我的模型",
        provider: "custom",
        model: "model-id",
        endpoint: "http://host:port/v1",
        apiKey: "env:MY_KEY",
      }, null, 2);
      return { type: "model_add_guide", platform: "tui", template };
    }
    return { type: "model_add_guide", platform: "web" };
  }

  if (args[0] === "remove" && args[1]) {
    try {
      ctx.modelRegistry.removeModel(args[1]);
      return { type: "model_removed", id: args[1] };
    } catch (err: any) {
      return { type: "error", message: err.message };
    }
  }

  try {
    const from = ctx.modelRegistry.getCurrent().id;
    const idOrIndex = /^\d+$/.test(args[0]) ? parseInt(args[0], 10) : args[0];
    const target = ctx.modelRegistry.switchTo(idOrIndex);
    const models = ctx.modelRegistry.getDisplayList();
    const info = models.find(m => m.id === target.id)!;
    return { type: "model_switched", from, to: info };
  } catch (err: any) {
    return { type: "error", message: err.message };
  }
}

async function handleRoleCommand(ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const permissions = await ctx.refreshPermissions();
  return {
    type: "role_info",
    role: ctx.role,
    permissions,
    availableTools: ctx.availableTools.map(t => t.name),
  };
}

function handleToolsCommand(ctx: SlashCommandContext): SlashCommandResult {
  return {
    type: "tools_list",
    tools: ctx.availableTools.map(t => ({ name: t.name, description: t.description })),
  };
}
```

- [ ] **Step 6: 更新 core index.ts 导出**

```typescript
export { parseSlashCommand, isSlashCommand } from "./slash-commands/parser.js";
export { handleSlashCommand } from "./slash-commands/handler.js";
export type { SlashCommand, SlashCommandResult } from "./slash-commands/types.js";
export type { SlashCommandContext } from "./slash-commands/handler.js";
```

- [ ] **Step 7: 验证编译 + 测试**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json && pnpm --filter @bicli/core test`

Expected: 0 errors, all tests pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): implement slash command parser and handlers"
```

---

### Task 6: TUI 集成斜杠命令

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` — 在 handleSingleMessage 中添加斜杠命令判断
- Modify: `packages/cli/src/tui/components/InputBar.tsx` — 输入 `/` 时不发给 LLM
- Modify: `packages/cli/src/tui/App.tsx` — 斜杠命令结果渲染

- [ ] **Step 1: 在 handleSingleMessage 中支持斜杠命令**

修改 `packages/cli/src/commands/chat.ts` 的 `handleSingleMessage` 函数开头，添加斜杠命令拦截：

在 `const mcp = new McpConnection();` 之前添加：
```typescript
import { isSlashCommand, parseSlashCommand, handleSlashCommand, ModelRegistry } from "@bicli/core";
import type { SlashCommandContext } from "@bicli/core";

// 在 handleSingleMessage 函数开头
if (isSlashCommand(message)) {
  const cmd = parseSlashCommand(message);
  if (!cmd) return;

  const modelRegistry = new ModelRegistry();
  const session = new Session(config.session.maxTurns);

  const ctx: SlashCommandContext = {
    modelRegistry,
    session,
    role: config.user.role,
    permissions: [],
    availableTools: [],
    platform: "tui",
    refreshPermissions: async () => [],
  };

  const result = await handleSlashCommand(cmd, ctx);
  renderSlashResult(result);
  return;
}
```

新增 `renderSlashResult` 函数处理 TUI 输出：
```typescript
function renderSlashResult(result: SlashCommandResult) {
  switch (result.type) {
    case "model_list": {
      console.log(`\n  当前模型: ${result.current}\n`);
      console.log("  可用模型:");
      result.models.forEach((m, i) => {
        const marker = m.id === result.current ? "●" : " ";
        const warn = m.available ? "" : `  ⚠ 未配置 ${m.missingEnvKey}`;
        console.log(`  [${i + 1}] ${marker} ${m.name}  (${m.provider}/${m.id})${warn}`);
      });
      console.log("\n  输入编号或模型 ID 切换\n");
      break;
    }
    case "model_switched":
      console.log(`  ✓ 已切换到: ${result.to.name} (${result.to.id})`);
      break;
    case "model_add_guide":
      if (result.platform === "tui" && result.template) {
        console.log(`\n  TUI 模式下请编辑配置文件添加自定义模型：\n`);
        console.log(`  文件: ~/.bicli/models.json\n`);
        console.log(`  在 models 数组中添加:\n${result.template}\n`);
      }
      break;
    case "role_info":
      console.log(`\n  角色: ${result.role}`);
      console.log(`  权限: ${result.permissions.join(", ") || "(无)"}`);
      console.log(`  可用工具: ${result.availableTools.join(", ") || "(无)"}\n`);
      break;
    case "tools_list":
      console.log("\n  可用工具:");
      result.tools.forEach(t => console.log(`    - ${t.name}: ${t.description}`));
      console.log();
      break;
    case "cleared":
      console.log("  ✓ 对话已清空");
      break;
    case "help":
      console.log("\n  可用命令:");
      result.commands.forEach(c => console.log(`    ${c.command.padEnd(25)} ${c.description}`));
      console.log();
      break;
    case "error":
      console.error(`  ✗ ${result.message}`);
      break;
  }
}
```

- [ ] **Step 2: 验证斜杠命令**

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "/model"`

Expected: 显示模型列表

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "/help"`

Expected: 显示命令帮助

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(cli): integrate slash commands in TUI chat"
```

---

## Chunk 3: MCP Server 扩展

### Task 7: tools/list 增加 _meta.requiredPermissions

**Files:**
- Modify: `packages/mcp-server/src/tools/register.ts` — ToolDef 接口添加 requiredPermissions，ListTools 响应添加 _meta

- [ ] **Step 1: 修改 ToolDef 接口和 tools 数组**

修改 `packages/mcp-server/src/tools/register.ts`:

接口改为:
```typescript
interface ToolDef {
  name: string;
  description: string;
  schema: any;
  requiredPermissions: string[];
  handler: (db: Database, args: Record<string, unknown>) => Promise<any>;
}
```

每个 tool 添加 `requiredPermissions`:
```typescript
const tools: ToolDef[] = [
  { name: "user_list", description: "分页查询用户列表，支持按状态/角色/关键词筛选", schema: userListSchema, requiredPermissions: ["user:read"], handler: userList },
  { name: "user_manage", description: "创建/更新/删除用户", schema: userManageSchema, requiredPermissions: ["user:write"], handler: userManage },
  { name: "form_create", description: "根据描述创建表单及字段定义", schema: formCreateSchema, requiredPermissions: ["form:write"], handler: formCreate },
  { name: "form_manage", description: "更新或删除表单（修改名称/描述/状态）", schema: formManageSchema, requiredPermissions: ["form:write"], handler: formManage },
  { name: "form_query", description: "查询表单列表或详情（含字段定义）", schema: formQuerySchema, requiredPermissions: ["form:read"], handler: formQuery },
  { name: "data_query", description: "通用数据查询，支持条件筛选/排序/分页", schema: dataQuerySchema, requiredPermissions: ["data:read"], handler: dataQuery },
  { name: "data_aggregate", description: "聚合统计（COUNT/SUM/AVG），支持 GROUP BY", schema: dataAggregateSchema, requiredPermissions: ["data:read"], handler: dataAggregate },
  { name: "config_get", description: "读取系统配置项", schema: configGetSchema, requiredPermissions: ["config:read"], handler: configGet },
  { name: "config_set", description: "创建或更新系统配置项（JSON值）", schema: configSetSchema, requiredPermissions: ["config:write"], handler: configSet },
  { name: "role_list", description: "查询角色及其权限列表", schema: roleListSchema, requiredPermissions: ["role:read"], handler: roleList },
  { name: "role_manage", description: "创建/更新/删除角色，分配权限", schema: roleManageSchema, requiredPermissions: ["role:write"], handler: roleManage },
];
```

- [ ] **Step 2: 修改 ListTools handler 添加 _meta**

在 `registerTools` 函数中修改 `ListToolsRequestSchema` handler:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema) as any,
    _meta: {
      requiredPermissions: t.requiredPermissions,
    },
  })),
}));
```

- [ ] **Step 3: 验证**

Run: `npx tsx packages/cli/bin/bicli.ts mcp status`

Expected: Connected, 11 tools（现有功能不回退）

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat(mcp-server): add _meta.requiredPermissions to tools/list"
```

---

### Task 8: 新增 self_permissions 工具

**Files:**
- Create: `packages/mcp-server/src/tools/self-permissions.ts`
- Modify: `packages/mcp-server/src/tools/register.ts` — 注册新工具

- [ ] **Step 1: 创建 self-permissions 工具**

`packages/mcp-server/src/tools/self-permissions.ts`:
```typescript
import { z } from "zod";
import type { Database } from "../db/connection.js";
import { extractContext, resolveUserPermissions } from "../auth/rbac.js";
import { formatSuccess, formatError } from "./base.js";

export const selfPermissionsSchema = z.object({
  _context: z.object({
    userId: z.number(),
    role: z.string(),
  }),
});

export async function selfPermissions(db: Database, args: Record<string, unknown>) {
  try {
    const { context } = extractContext(args);
    const permissions = await resolveUserPermissions(db, context);
    return formatSuccess({ role: context.role, permissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return formatError("INTERNAL_ERROR", message);
  }
}
```

- [ ] **Step 2: 在 register.ts 注册**

在 `packages/mcp-server/src/tools/register.ts` 添加 import:
```typescript
import { selfPermissions, selfPermissionsSchema } from "./self-permissions.js";
```

在 `tools` 数组末尾添加:
```typescript
{ name: "self_permissions", description: "获取当前用户自身的角色和权限列表", schema: selfPermissionsSchema, requiredPermissions: [], handler: selfPermissions },
```

- [ ] **Step 3: 验证**

Run: `npx tsx packages/cli/bin/bicli.ts mcp status`

Expected: 12 tools（新增 self_permissions）

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat(mcp-server): add self_permissions tool (no auth required)"
```

---

### Task 11: data_scope_rules 表 + 行级过滤

**Files:**
- Modify: `packages/mcp-server/src/db/schema.ts` — 添加 dataScopeRules 表
- Create: `packages/mcp-server/src/auth/data-scope.ts` — 行级过滤逻辑
- Modify: `packages/mcp-server/src/db/seed.ts` — 添加 data_scope_rules 种子数据
- Modify: `packages/mcp-server/src/tools/user-list.ts` — 集成行级过滤
- Modify: `packages/mcp-server/src/tools/form-query.ts` — 集成行级过滤
- Modify: `packages/mcp-server/src/tools/data-query.ts` — 集成行级过滤
- Modify: `packages/mcp-server/src/tools/config-get.ts` — 集成行级过滤

- [ ] **Step 1: 在 schema.ts 添加 dataScopeRules 表**

在 `packages/mcp-server/src/db/schema.ts` 末尾添加:
```typescript
export const dataScopeRules = mysqlTable("data_scope_rules", {
  id: serial().primaryKey(),
  roleId: bigint("role_id", { mode: "number", unsigned: true })
    .references(() => roles.id)
    .notNull(),
  resource: varchar({ length: 50 }).notNull(),
  scopeType: mysqlEnum("scope_type", ["all", "own", "condition", "deny"]).notNull(),
  ownerField: varchar("owner_field", { length: 50 }),
  conditionField: varchar("condition_field", { length: 50 }),
  conditionOperator: mysqlEnum("condition_operator", ["eq", "in", "ne"]).default("eq"),
  conditionValue: json("condition_value"),
  priority: int().default(0).notNull(),
});
```

- [ ] **Step 2: 推表结构**

Run: `pnpm db:push`

Expected: 成功创建 data_scope_rules 表

- [ ] **Step 3: 实现 data-scope.ts**

`packages/mcp-server/src/auth/data-scope.ts`:
```typescript
import { eq, and, inArray, ne, desc, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { dataScopeRules, roles } from "../db/schema.js";
import type { ToolContext } from "../types/index.js";

export interface DataScopeRule {
  scopeType: "all" | "own" | "condition" | "deny";
  ownerField?: string;
  conditionField?: string;
  conditionOperator?: "eq" | "in" | "ne";
  conditionValue?: unknown;
}

export async function getDataScopeRules(
  db: Database,
  roleName: string,
  resource: string
): Promise<DataScopeRule[]> {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
  if (!role) throw new Error(`Role '${roleName}' not found in database`);

  const rules = await db.query.dataScopeRules.findMany({
    where: and(
      eq(dataScopeRules.roleId, role.id),
      inArray(dataScopeRules.resource, [resource, "*"]),
    ),
    orderBy: desc(dataScopeRules.priority),
  });

  if (rules.length === 0) return [{ scopeType: "deny" }];
  return rules.map(r => ({
    scopeType: r.scopeType as DataScopeRule["scopeType"],
    ownerField: r.ownerField ?? undefined,
    conditionField: r.conditionField ?? undefined,
    conditionOperator: (r.conditionOperator as DataScopeRule["conditionOperator"]) ?? "eq",
    conditionValue: r.conditionValue ?? undefined,
  }));
}

export function applyDataScope(
  rules: DataScopeRule[],
  context: ToolContext,
  tableRef: any,
  conditions: SQL[]
): SQL[] {
  const rule = rules[0];
  if (!rule || rule.scopeType === "all") return conditions;
  if (rule.scopeType === "deny") {
    conditions.push(sql`1 = 0`);
    return conditions;
  }
  if (rule.scopeType === "own" && rule.ownerField) {
    conditions.push(eq(tableRef[rule.ownerField], context.userId));
  }
  if (rule.scopeType === "condition" && rule.conditionField) {
    const column = tableRef[rule.conditionField];
    switch (rule.conditionOperator) {
      case "eq":
        conditions.push(eq(column, rule.conditionValue));
        break;
      case "in":
        conditions.push(inArray(column, rule.conditionValue as any[]));
        break;
      case "ne":
        conditions.push(ne(column, rule.conditionValue));
        break;
    }
  }
  return conditions;
}
```

- [ ] **Step 4: 更新 seed.ts 添加 data_scope_rules 数据**

在 `packages/mcp-server/src/db/seed.ts` 的 import 中添加 `dataScopeRules`，在种子函数末尾、`process.exit(0)` 之前添加:
```typescript
await db.delete(dataScopeRules);

await db.insert(dataScopeRules).values([
  { roleId: adminRole.id, resource: "*", scopeType: "all", priority: 0 },
  { roleId: editorRole.id, resource: "forms", scopeType: "own", ownerField: "created_by", priority: 0 },
  { roleId: editorRole.id, resource: "form_fields", scopeType: "own", ownerField: "created_by", priority: 0 },
  { roleId: editorRole.id, resource: "users", scopeType: "all", priority: 0 },
  { roleId: editorRole.id, resource: "configs", scopeType: "all", priority: 0 },
  { roleId: viewerRole.id, resource: "forms", scopeType: "own", ownerField: "created_by", priority: 0 },
  { roleId: viewerRole.id, resource: "form_fields", scopeType: "own", ownerField: "created_by", priority: 0 },
  { roleId: viewerRole.id, resource: "users", scopeType: "condition", conditionField: "status", conditionOperator: "eq", conditionValue: "active", priority: 0 },
  { roleId: viewerRole.id, resource: "configs", scopeType: "all", priority: 0 },
]);
```

- [ ] **Step 5: 重新推表并 seed**

Run: `pnpm db:push && pnpm seed`

Expected: 表创建成功，种子数据写入成功

- [ ] **Step 6: 在 user-list.ts 集成行级过滤**

修改 `packages/mcp-server/src/tools/user-list.ts` 的 `withAuth` 回调，添加数据范围过滤:

在 handler 回调参数添加 `context`，在 `conditions` 构建后、执行查询前添加:
```typescript
import { getDataScopeRules, applyDataScope } from "../auth/data-scope.js";

// 在 withAuth 回调内，conditions 构建完后:
const scopeRules = await getDataScopeRules(db, context.role, "users");
applyDataScope(scopeRules, context, users, conditions);
```

- [ ] **Step 7: 在 data-query.ts 集成行级过滤**

修改 `packages/mcp-server/src/tools/data-query.ts`，在 `buildWhereConditions` 调用后添加:
```typescript
import { getDataScopeRules, applyDataScope } from "../auth/data-scope.js";

// 在 withAuth 回调内，conditions 构建完后:
const scopeRules = await getDataScopeRules(db, context.role, input.table);
applyDataScope(scopeRules, context, table, conditions);
```

- [ ] **Step 8: 验证**

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "查询所有用户" --role admin`

Expected: 返回所有用户

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(mcp-server): implement data_scope_rules and row-level filtering"
```

---

## Chunk 4: 权限体系 + 权限获取

### Task 9: Skill 可见性过滤（Layer 1）

**Files:**
- Modify: `packages/core/src/skill-loader/matcher.ts` — match() 接受 userPermissions 参数

- [ ] **Step 1: 修改 SkillMatcher.match 签名**

修改 `packages/core/src/skill-loader/matcher.ts`:

```typescript
import type { Skill } from "@bicli/skills";

export class SkillMatcher {
  private skills: Skill[];

  constructor(skills: Skill[]) {
    this.skills = skills;
  }

  match(userInput: string, userPermissions?: string[]): Skill | null {
    for (const skill of this.skills) {
      if (userPermissions && skill.requiredPermissions.length > 0) {
        if (!skill.requiredPermissions.every(p => userPermissions.includes(p))) {
          continue;
        }
      }
      for (const trigger of skill.triggers) {
        if (userInput.includes(trigger)) {
          return skill;
        }
      }
    }
    return null;
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json`

Expected: 0 errors（旧调用 `match(input)` 仍兼容，因 userPermissions 可选）

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(core): add permission-based skill visibility filtering"
```

---

### Task 10: Tool 可见性过滤（Layer 2）

**Files:**
- Create: `packages/core/src/permissions/tool-filter.ts`
- Create: `packages/core/src/permissions/__tests__/tool-filter.test.ts`
- Modify: `packages/core/src/index.ts` — 导出

- [ ] **Step 1: 编写测试**

`packages/core/src/permissions/__tests__/tool-filter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { filterToolsByPermission } from "../tool-filter.js";

const mockTools = [
  { name: "user_list", description: "List users", _meta: { requiredPermissions: ["user:read"] } },
  { name: "user_manage", description: "Manage users", _meta: { requiredPermissions: ["user:write"] } },
  { name: "form_query", description: "Query forms", _meta: { requiredPermissions: ["form:read"] } },
  { name: "self_permissions", description: "Self perms", _meta: { requiredPermissions: [] } },
  { name: "unknown_tool", description: "No meta" },
];

describe("filterToolsByPermission", () => {
  it("should filter tools for viewer", () => {
    const perms = ["user:read", "form:read", "data:read", "config:read"];
    const result = filterToolsByPermission(mockTools as any, perms);
    const names = result.map(t => t.name);
    expect(names).toContain("user_list");
    expect(names).toContain("form_query");
    expect(names).toContain("self_permissions");
    expect(names).toContain("unknown_tool");
    expect(names).not.toContain("user_manage");
  });

  it("should return all tools for admin", () => {
    const perms = ["user:read", "user:write", "form:read", "form:write", "data:read", "config:read", "config:write", "role:read", "role:write"];
    const result = filterToolsByPermission(mockTools as any, perms);
    expect(result.length).toBe(mockTools.length);
  });
});
```

- [ ] **Step 2: 实现 tool-filter.ts**

`packages/core/src/permissions/tool-filter.ts`:
```typescript
export interface ToolWithMeta {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: {
    requiredPermissions?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function filterToolsByPermission(
  tools: ToolWithMeta[],
  userPermissions: string[]
): ToolWithMeta[] {
  return tools.filter(t => {
    const required = t._meta?.requiredPermissions as string[] | undefined;
    if (!required || required.length === 0) return true;
    return required.every((p: string) => userPermissions.includes(p));
  });
}
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @bicli/core test`

Expected: PASS

- [ ] **Step 4: 导出并 Commit**

```bash
git add -A
git commit -m "feat(core): implement Tool visibility filtering (Layer 2)"
```

---

### Task 12: 权限获取（启动 + 定时刷新）

**Files:**
- Create: `packages/core/src/permissions/resolver.ts`
- Modify: `packages/core/src/index.ts` — 导出

- [ ] **Step 1: 实现权限解析器**

`packages/core/src/permissions/resolver.ts`:
```typescript
import type { McpConnection } from "../mcp-client/connection.js";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export class PermissionResolver {
  private mcp: McpConnection;
  private userId: number;
  private role: string;
  private permissions: string[] = [];
  private timer?: ReturnType<typeof setInterval>;

  constructor(mcp: McpConnection, userId: number, role: string) {
    this.mcp = mcp;
    this.userId = userId;
    this.role = role;
  }

  async initialize(): Promise<string[]> {
    this.permissions = await this.fetchPermissions();
    this.timer = setInterval(async () => {
      try {
        this.permissions = await this.fetchPermissions();
      } catch {
        // keep old permissions on refresh failure
      }
    }, REFRESH_INTERVAL);
    return this.permissions;
  }

  async refresh(): Promise<string[]> {
    this.permissions = await this.fetchPermissions();
    return this.permissions;
  }

  getPermissions(): string[] {
    return [...this.permissions];
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async fetchPermissions(): Promise<string[]> {
    const client = this.mcp.getClient();
    const result = await client.callTool({
      name: "self_permissions",
      arguments: {
        _context: { userId: this.userId, role: this.role },
      },
    });
    const text = (result.content as any[])?.[0]?.text || "{}";
    const parsed = JSON.parse(text);
    if (parsed.success && parsed.data?.permissions) {
      return parsed.data.permissions;
    }
    return [];
  }
}
```

- [ ] **Step 2: 导出**

添加到 `packages/core/src/index.ts`:
```typescript
export { PermissionResolver } from "./permissions/resolver.js";
export { filterToolsByPermission } from "./permissions/tool-filter.js";
export type { ToolWithMeta } from "./permissions/tool-filter.js";
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json`

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(core): implement permission resolver with auto-refresh"
```

---

## Chunk 5: Engine 封装 + CLI 适配

### Task 13: McpConnectionPool

**Files:**
- Create: `packages/core/src/mcp-client/pool.ts`
- Modify: `packages/core/src/index.ts` — 导出

- [ ] **Step 1: 实现连接池**

`packages/core/src/mcp-client/pool.ts`:
```typescript
import { McpConnection } from "./connection.js";

export class McpConnectionPool {
  private connection: McpConnection | null = null;
  private refCount = 0;
  private connectCommand: string;
  private connectArgs: string[];

  constructor(command: string, args: string[] = []) {
    this.connectCommand = command;
    this.connectArgs = args;
  }

  async initialize(): Promise<void> {
    this.connection = new McpConnection();
    await this.connection.connect(this.connectCommand, this.connectArgs);
  }

  acquire(): McpConnection {
    if (!this.connection) throw new Error("Pool not initialized");
    this.refCount++;
    return this.connection;
  }

  release(): void {
    this.refCount--;
    if (this.refCount <= 0 && this.connection) {
      this.connection.disconnect();
      this.connection = null;
      this.refCount = 0;
    }
  }

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    this.refCount = 0;
  }
}
```

- [ ] **Step 2: 导出并 Commit**

```bash
git add -A
git commit -m "feat(core): implement McpConnectionPool for shared connections"
```

---

### Task 14: BiCLIEngine 完整封装 + streamText

**Files:**
- Create: `packages/core/src/engine.ts`
- Modify: `packages/core/src/index.ts` — 导出 BiCLIEngine
- Modify: `packages/core/src/skill-loader/injector.ts` — 增强 buildSystemPrompt 支持权限

- [ ] **Step 1: 增强 injector.ts**

修改 `packages/core/src/skill-loader/injector.ts` 的 `buildSystemPrompt` 签名:

```typescript
import type { Skill } from "@bicli/skills";

const BASE_SYSTEM_PROMPT = `你是 BiCLI 智能助手，可以通过工具帮用户完成用户管理、表单创建、数据查询、配置管理和权限管理等操作。
请根据用户请求选择合适的工具来完成任务。执行工具调用后，用简洁友好的语言向用户展示结果。`;

export function buildSystemPrompt(
  matchedSkill: Skill | null,
  role?: string,
  permissions?: string[]
): string {
  let prompt = BASE_SYSTEM_PROMPT;
  if (role && permissions) {
    prompt += `\n\n当前用户角色: ${role}\n可用权限: ${permissions.join(", ")}\n请不要尝试超出用户权限范围的操作。`;
  }
  if (matchedSkill) {
    prompt += `\n\n---\n\n${matchedSkill.content}`;
  }
  return prompt;
}

export function filterTools(
  allTools: Array<{ name: string; [key: string]: unknown }>,
  matchedSkill: Skill | null
): Array<{ name: string; [key: string]: unknown }> {
  if (!matchedSkill) return allTools;
  return allTools.filter((t) => matchedSkill.requiredTools.includes(t.name));
}
```

- [ ] **Step 2: 实现 BiCLIEngine**

`packages/core/src/engine.ts`:
```typescript
import { streamText, stepCountIs } from "ai";
import { loadAllSkills } from "@bicli/skills";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigManager, type BiCliConfig } from "./config/manager.js";
import { McpConnection } from "./mcp-client/connection.js";
import { createModel, type ExtendedProvider } from "./llm/provider.js";
import { ToolCaller } from "./llm/tool-caller.js";
import { Session } from "./llm/session.js";
import { ModelRegistry, type ModelEntry } from "./model-registry/index.js";
import { SkillMatcher } from "./skill-loader/matcher.js";
import { buildSystemPrompt, filterTools } from "./skill-loader/injector.js";
import { PermissionResolver } from "./permissions/resolver.js";
import { filterToolsByPermission, type ToolWithMeta } from "./permissions/tool-filter.js";
import { parseSlashCommand, isSlashCommand } from "./slash-commands/parser.js";
import { handleSlashCommand, type SlashCommandContext } from "./slash-commands/handler.js";
import type { ChatEvent, EngineStatus, ToolInfo } from "./types.js";
import type { SlashCommandResult } from "./slash-commands/types.js";

export interface BiCLIEngineOptions {
  mcpConnection?: McpConnection;
  onDispose?: () => void;
  platform?: "tui" | "web";
}

export class BiCLIEngine {
  private config: BiCliConfig;
  private mcp: McpConnection;
  private ownsMcp: boolean;
  private session: Session;
  private modelRegistry: ModelRegistry;
  private skillMatcher!: SkillMatcher;
  private permissionResolver!: PermissionResolver;
  private allTools: ToolWithMeta[] = [];
  private onDisposeCallback?: () => void;
  private platform: "tui" | "web";

  constructor(options?: BiCLIEngineOptions) {
    const configManager = new ConfigManager();
    this.config = configManager.load();
    this.modelRegistry = new ModelRegistry();
    this.session = new Session(this.config.session.maxTurns);
    this.platform = options?.platform ?? "tui";
    this.onDisposeCallback = options?.onDispose;

    if (options?.mcpConnection) {
      this.mcp = options.mcpConnection;
      this.ownsMcp = false;
    } else {
      this.mcp = new McpConnection();
      this.ownsMcp = true;
    }
  }

  async initialize(): Promise<void> {
    if (this.ownsMcp) {
      const mcpServerPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../mcp-server/src/index.ts"
      );
      await this.mcp.connect("tsx", [mcpServerPath]);
    }

    this.allTools = this.mcp.getTools() as ToolWithMeta[];

    const skillsDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../skills/definitions"
    );
    const skills = loadAllSkills(skillsDir);
    this.skillMatcher = new SkillMatcher(skills);

    this.permissionResolver = new PermissionResolver(
      this.mcp,
      this.config.user.userId,
      this.config.user.role
    );
    await this.permissionResolver.initialize();
  }

  async dispose(): Promise<void> {
    this.permissionResolver?.dispose();
    if (this.ownsMcp) {
      await this.mcp.disconnect();
    }
    this.onDisposeCallback?.();
  }

  async *chat(message: string): AsyncGenerator<ChatEvent> {
    this.session.addMessage({ role: "user", content: message });

    const permissions = this.permissionResolver.getPermissions();
    const matchedSkill = this.skillMatcher.match(message, permissions);
    const systemPrompt = buildSystemPrompt(matchedSkill, this.config.user.role, permissions);

    const visibleTools = filterToolsByPermission(this.allTools, permissions);
    const filteredTools = filterTools(visibleTools, matchedSkill);

    const toolCaller = new ToolCaller(this.mcp.getClient(), {
      userId: this.config.user.userId,
      role: this.config.user.role,
    });

    const currentModel = this.modelRegistry.getCurrent();
    const customConfig = currentModel.provider === "custom" && currentModel.endpoint
      ? { endpoint: currentModel.endpoint, apiKey: this.modelRegistry.resolveApiKey(currentModel.apiKey || ""), model: currentModel.model }
      : undefined;
    const model = createModel(currentModel.provider as ExtendedProvider, currentModel.model, customConfig);

    const aiTools: Record<string, any> = {};
    for (const tool of filteredTools) {
      aiTools[tool.name] = {
        description: (tool as any).description,
        parameters: (tool as any).inputSchema,
        execute: async (args: Record<string, unknown>) => {
          yield { type: "tool_call_start" as const, toolName: tool.name, args };
          try {
            const result = await toolCaller.call(tool.name, args);
            const text = (result.content as any[])?.[0]?.text || "{}";
            const parsed = JSON.parse(text);
            yield { type: "tool_call_end" as const, toolName: tool.name, result: parsed };
            return parsed;
          } catch (err) {
            yield { type: "error" as const, message: `Tool ${tool.name} failed: ${err}` };
            throw err;
          }
        },
      };
    }

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: this.session.getMessages(),
        tools: aiTools,
        stopWhen: stepCountIs(5),
      });

      let fullText = "";
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          fullText += part.textDelta;
          yield { type: "text_delta", content: part.textDelta };
        }
      }

      const finalText = await result.text;
      this.session.addMessage({ role: "assistant", content: finalText || fullText });
      yield { type: "done", fullText: finalText || fullText };
    } catch (err: any) {
      yield { type: "error", message: err.message };
    }
  }

  async handleSlashCommand(command: string): Promise<SlashCommandResult> {
    const cmd = parseSlashCommand(command);
    if (!cmd) return { type: "error", message: "Invalid slash command" };

    const ctx: SlashCommandContext = {
      modelRegistry: this.modelRegistry,
      session: this.session,
      role: this.config.user.role,
      permissions: this.permissionResolver.getPermissions(),
      availableTools: this.getAvailableTools(),
      platform: this.platform,
      refreshPermissions: () => this.permissionResolver.refresh(),
    };

    return handleSlashCommand(cmd, ctx);
  }

  getStatus(): EngineStatus {
    const currentModel = this.modelRegistry.getCurrent();
    return {
      connected: true,
      model: `${currentModel.provider}/${currentModel.model}`,
      role: this.config.user.role,
      toolCount: this.getAvailableTools().length,
      permissionCount: this.permissionResolver.getPermissions().length,
    };
  }

  getCurrentModel(): ModelEntry {
    return this.modelRegistry.getCurrent();
  }

  getPermissions(): string[] {
    return this.permissionResolver.getPermissions();
  }

  getAvailableTools(): ToolInfo[] {
    const permissions = this.permissionResolver.getPermissions();
    const visible = filterToolsByPermission(this.allTools, permissions);
    return visible.map(t => ({
      name: t.name,
      description: (t as any).description || "",
      requiredPermissions: (t._meta?.requiredPermissions as string[]) ?? [],
    }));
  }

  async refreshPermissions(): Promise<string[]> {
    return this.permissionResolver.refresh();
  }
}
```

- [ ] **Step 3: 更新 core index.ts 最终导出**

添加到 `packages/core/src/index.ts`:
```typescript
export { BiCLIEngine } from "./engine.js";
export type { BiCLIEngineOptions } from "./engine.js";
export { McpConnectionPool } from "./mcp-client/pool.js";
```

- [ ] **Step 4: 验证编译**

Run: `npx tsc --noEmit -p packages/core/tsconfig.json`

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): implement BiCLIEngine with streamText and full integration"
```

---

### Task 15: CLI 适配新的 core API

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` — 使用 BiCLIEngine

- [ ] **Step 1: 重写 chat.ts 使用 BiCLIEngine**

`packages/cli/src/commands/chat.ts` 完整重写:
```typescript
import { Command } from "commander";
import {
  BiCLIEngine,
  isSlashCommand,
  type SlashCommandResult,
} from "@bicli/core";

export function chatCommand() {
  const cmd = new Command("chat")
    .description("Start AI chat session")
    .option("-m, --message <message>", "Send a single message (non-interactive)")
    .option("-p, --provider <provider>", "LLM provider override")
    .option("--model <model>", "Model name override")
    .action(async (options) => {
      if (options.message) {
        await handleSingleMessage(options.message);
      } else {
        const { startTui } = await import("../tui/index.js");
        await startTui();
      }
    });

  return cmd;
}

async function handleSingleMessage(message: string) {
  const engine = new BiCLIEngine({ platform: "tui" });

  try {
    await engine.initialize();

    if (isSlashCommand(message)) {
      const result = await engine.handleSlashCommand(message);
      renderSlashResult(result);
      return;
    }

    const status = engine.getStatus();
    console.log(`Using ${status.model}`);

    for await (const event of engine.chat(message)) {
      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.content || "");
          break;
        case "tool_call_start":
          console.log(`\n  → calling ${event.toolName}(${JSON.stringify(event.args)})`);
          break;
        case "tool_call_end":
          console.log(`  ← ${event.toolName} returned`);
          break;
        case "error":
          console.error(`  ✗ ${event.message}`);
          break;
        case "done":
          console.log();
          break;
      }
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  } finally {
    await engine.dispose();
  }
}

function renderSlashResult(result: SlashCommandResult) {
  switch (result.type) {
    case "model_list": {
      console.log(`\n  当前模型: ${result.current}\n`);
      console.log("  可用模型:");
      result.models.forEach((m, i) => {
        const marker = m.id === result.current ? "●" : " ";
        const warn = m.available ? "" : `  ⚠ 未配置 ${m.missingEnvKey}`;
        console.log(`  [${i + 1}] ${marker} ${m.name}  (${m.provider}/${m.id})${warn}`);
      });
      console.log("\n  输入编号或模型 ID 切换\n");
      break;
    }
    case "model_switched":
      console.log(`  ✓ 已切换到: ${result.to.name} (${result.to.id})`);
      break;
    case "model_add_guide":
      if (result.platform === "tui" && result.template) {
        console.log(`\n  TUI 模式下请编辑配置文件:\n  文件: ~/.bicli/models.json\n`);
        console.log(`  添加:\n${result.template}\n`);
      }
      break;
    case "role_info":
      console.log(`\n  角色: ${result.role}`);
      console.log(`  权限: ${result.permissions.join(", ") || "(无)"}`);
      console.log(`  可用工具: ${result.availableTools.join(", ") || "(无)"}\n`);
      break;
    case "tools_list":
      console.log("\n  可用工具:");
      result.tools.forEach(t => console.log(`    - ${t.name}: ${t.description}`));
      console.log();
      break;
    case "cleared":
      console.log("  ✓ 对话已清空");
      break;
    case "help":
      console.log("\n  可用命令:");
      result.commands.forEach(c => console.log(`    ${c.command.padEnd(25)} ${c.description}`));
      console.log();
      break;
    case "error":
      console.error(`  ✗ ${result.message}`);
      break;
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`

Expected: 0 errors

- [ ] **Step 3: 端到端验证**

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "/model"`

Expected: 显示模型列表

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "/help"`

Expected: 显示命令帮助

Run: `npx tsx packages/cli/bin/bicli.ts chat -m "查询所有用户"`

Expected: 流式输出 AI 响应 + 工具调用

Run: `npx tsx packages/cli/bin/bicli.ts mcp status`

Expected: 12 tools（含 self_permissions）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(cli): use BiCLIEngine from @bicli/core for all chat operations"
```

---

### Task 16: 全量测试 + 文档更新

**Files:**
- Modify: `docs/getting-started.md` — 更新斜杠命令和模型管理说明
- Run: 全量测试

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`

Expected: 所有包测试通过

- [ ] **Step 2: 修复测试失败（如有）**

针对迁移导致的 import 路径变化修复测试文件。

- [ ] **Step 3: 更新 getting-started.md**

在 `docs/getting-started.md` 添加二期新功能说明：

```markdown
## 斜杠命令

在对话中输入 `/` 开头的命令：

| 命令 | 说明 |
|------|------|
| `/model` | 查看和切换模型 |
| `/model <id>` | 快速切换模型 |
| `/model add` | 添加自定义模型 |
| `/role` | 查看当前角色和权限 |
| `/tools` | 查看可用工具 |
| `/clear` | 清空对话 |
| `/help` | 帮助 |

## 模型管理

模型配置存储在 `~/.bicli/models.json`。内置支持阿里千问、OpenAI、Anthropic。

添加自定义模型（OpenAI-compatible）：编辑 `~/.bicli/models.json`，在 `models` 数组中添加条目。
```

- [ ] **Step 4: 更新根 package.json scripts**

添加 core 相关脚本:
```json
{
  "scripts": {
    "dev:core": "pnpm --filter @bicli/core dev",
    "test:core": "pnpm --filter @bicli/core test"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update getting-started with Phase 2a features"
```

---

## 验收标准

Phase 2a 完成后应满足：

1. **`@bicli/core` 独立运行** — `BiCLIEngine` 可在任何 Node.js 环境中实例化
2. **斜杠命令** — `/model`, `/role`, `/tools`, `/clear`, `/help` 全部可用
3. **模型管理** — `/model` 列表 + 数字切换 + `/model add` 引导
4. **权限三层** — Skill 过滤 + Tool 过滤 + 数据行级过滤
5. **12 个 MCP 工具** — 原 11 + self_permissions
6. **流式输出** — `streamText()` + `AsyncGenerator<ChatEvent>`
7. **一期功能不回退** — `chat -m`、`mcp status`、`config show` 正常工作
