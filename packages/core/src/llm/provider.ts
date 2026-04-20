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
