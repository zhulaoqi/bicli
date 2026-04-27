import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rootEnv = resolve(__dirname, "../../../.env");
const localEnv = resolve(__dirname, "../../.env");
const profile = process.env.PROFILE || process.env.NODE_ENV;
const profileRootEnv = profile ? resolve(__dirname, `../../../.env.${profile}`) : null;
const profileLocalEnv = profile ? resolve(__dirname, `../../.env.${profile}`) : null;
const runtimeEnv = process.env.BICLI_RUNTIME_ENV_FILE || "/tmp/bicli-apollo.env";

// 先加载运行时配置（如 Apollo 拉取结果），再加载环境专属配置和通用 .env 作为兜底。
// dotenv 默认不会覆盖已经存在的 process.env，因此发布平台注入的变量优先级最高。
let loaded = false;

for (const envPath of [runtimeEnv, profileRootEnv, profileLocalEnv, rootEnv, localEnv]) {
  if (envPath && existsSync(envPath)) {
    config({ path: envPath });
    loaded = true;
  }
}

if (!loaded) {
  config();
}
