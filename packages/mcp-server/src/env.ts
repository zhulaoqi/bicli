import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rootEnv = resolve(__dirname, "../../../.env");
const localEnv = resolve(__dirname, "../../.env");

if (existsSync(rootEnv)) {
  config({ path: rootEnv });
} else if (existsSync(localEnv)) {
  config({ path: localEnv });
} else {
  config();
}
