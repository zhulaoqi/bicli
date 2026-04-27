export type ProviderName = "alibaba" | "openai" | "anthropic" | "custom";

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderName;
  tags: string[];
  supportsTools: boolean;
  available: boolean;
}

export interface CustomModelRecord {
  id: number;
  modelId: string;
  name: string;
  endpoint: string;
  apiKey: string;
  createdBy: string | null;
  createdAt: Date;
}

/** 从环境变量生成内置预设模型列表（同步，无 DB 依赖） */
export function listBuiltinModels(): ModelOption[] {
  const out: ModelOption[] = [];
  const hasAli = !!process.env.ALIBABA_API_KEY;
  const hasOAI = !!process.env.OPENAI_API_KEY;
  const hasAnt = !!process.env.ANTHROPIC_API_KEY;
  const hasCus = !!(process.env.CUSTOM_API_URL && (process.env.CUSTOM_API_KEY || process.env.CUSTOM_MODEL_API_KEY));

  if (hasAli) {
    out.push({ id: "qwen-turbo", name: "千问 Turbo", provider: "alibaba", tags: ["快", "免费"], supportsTools: true, available: true });
    out.push({ id: "qwen-plus", name: "千问 Plus", provider: "alibaba", tags: ["推荐"], supportsTools: true, available: true });
    out.push({ id: "qwen-max", name: "千问 Max", provider: "alibaba", tags: ["最强", "慢"], supportsTools: true, available: true });
  }

  if (hasOAI) {
    out.push({ id: "gpt-4o", name: "GPT-4o", provider: "openai", tags: ["视觉"], supportsTools: true, available: true });
    out.push({ id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", tags: ["便宜"], supportsTools: true, available: true });
  }

  if (hasAnt) {
    out.push({ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", tags: ["推理"], supportsTools: true, available: true });
  }

  if (hasCus) {
    const customModel = process.env.CUSTOM_MODEL || "custom";
    out.push({
      id: customModel,
      name: `自定义: ${customModel}`,
      provider: "custom",
      tags: ["自建"],
      supportsTools: true,
      available: true,
    });
  }

  return out;
}

/** 兼容旧调用（不传 DB 时只返回内置） */
export function listModels(): ModelOption[] {
  return listBuiltinModels();
}

export function guessProvider(model: string): ProviderName {
  if (model.startsWith("qwen")) return "alibaba";
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  return "custom";
}

export function defaultModel(): string {
  if (process.env.ALIBABA_API_KEY) return "qwen-plus";
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet-4-20250514";
  if (process.env.CUSTOM_MODEL) return process.env.CUSTOM_MODEL;
  return "qwen-plus";
}
