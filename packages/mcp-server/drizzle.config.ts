import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const __dirname = dirname(fileURLToPath(import.meta.url));

const profile = process.env.PROFILE || process.env.NODE_ENV;
const envFiles = [
  profile ? resolve(__dirname, `../../.env.${profile}`) : null,
  resolve(__dirname, "../../.env"),
];

for (const envFile of envFiles) {
  if (envFile && existsSync(envFile)) {
    config({ path: envFile });
  }
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME || "bicli",
  },
});
