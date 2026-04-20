import { createAlibaba } from "@ai-sdk/alibaba";
import type { LanguageModel } from "ai";

export function createQwenProvider(model: string): LanguageModel {
  const alibaba = createAlibaba({
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
  return alibaba(model);
}
