import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function createOpenAIProvider(model: string): LanguageModel {
  const openai = createOpenAI({});
  return openai(model);
}
