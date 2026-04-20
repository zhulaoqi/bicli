import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type ProviderName = "alibaba" | "openai" | "anthropic";

export interface ModelConfig {
  provider: ProviderName;
  model: string;
}

export interface AuthConfig {
  token?: string;
  endpoint?: string;
  expiresAt?: string;
}

export interface BiCliConfig {
  model: ModelConfig;
  mcp: {
    transport: "stdio";
    command: string;
  };
  user: {
    userId: number;
    role: string;
  };
  auth?: AuthConfig;
  session: {
    maxTurns: number;
  };
}

const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  alibaba: "ALIBABA_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string> = {
  alibaba: "qwen-plus",
  openai: "gpt-4",
  anthropic: "claude-sonnet-4-20250514",
};

function detectProvider(): ModelConfig {
  for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
    if (process.env[envKey]) {
      const p = provider as ProviderName;
      return { provider: p, model: PROVIDER_DEFAULT_MODELS[p] };
    }
  }
  return { provider: "alibaba", model: "qwen-plus" };
}

export function getProviderEnvKey(provider: ProviderName): string {
  return PROVIDER_ENV_KEYS[provider];
}

export function getAvailableProviders(): Array<{ provider: ProviderName; envKey: string; available: boolean }> {
  return (Object.entries(PROVIDER_ENV_KEYS) as [ProviderName, string][]).map(([provider, envKey]) => ({
    provider,
    envKey,
    available: !!process.env[envKey],
  }));
}

const DEFAULT_CONFIG: Omit<BiCliConfig, "model"> = {
  mcp: { transport: "stdio", command: "bicli-mcp-server" },
  user: { userId: 1, role: "admin" },
  session: { maxTurns: 20 },
};

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), ".bicli", "config.json");
  }

  load(): BiCliConfig {
    const detected = detectProvider();
    const defaults = { ...DEFAULT_CONFIG, model: detected };

    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, "utf-8");
        const saved = JSON.parse(raw);
        return {
          ...defaults,
          ...saved,
          model: { ...defaults.model, ...saved.model },
          user: { ...defaults.user, ...saved.user },
        };
      }
    } catch {
      // fall through to default
    }
    return defaults;
  }

  save(config: BiCliConfig): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  getDefault(): BiCliConfig {
    return { ...DEFAULT_CONFIG, model: detectProvider() };
  }

  setAuth(auth: AuthConfig): void {
    const config = this.load();
    config.auth = auth;
    this.save(config);
  }

  clearAuth(): void {
    const config = this.load();
    delete config.auth;
    this.save(config);
  }

  getAuth(): AuthConfig | undefined {
    return this.load().auth;
  }

  isAuthenticated(): boolean {
    const auth = this.getAuth();
    if (!auth?.token) return false;
    if (auth.expiresAt && new Date(auth.expiresAt) < new Date()) return false;
    return true;
  }
}
