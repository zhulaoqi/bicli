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
  return provider.chat(config.model);
}
