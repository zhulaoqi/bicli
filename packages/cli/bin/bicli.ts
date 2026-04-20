#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, "../../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });
else config();

import { main } from "../src/index.js";
main(process.argv);
