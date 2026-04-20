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
