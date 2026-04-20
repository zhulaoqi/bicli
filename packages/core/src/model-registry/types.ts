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
