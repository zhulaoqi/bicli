import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export function createAnthropicProvider(model: string): LanguageModel {
  const anthropic = createAnthropic({});
  return anthropic(model);
}
