import "../env.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const drizzleDir = resolve(process.cwd(), "drizzle");

function latestMigrationFile(): string {
  if (!existsSync(drizzleDir)) {
    throw new Error(`Drizzle migration directory not found: ${drizzleDir}`);
  }
  const files = readdirSync(drizzleDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`No migration SQL found in ${drizzleDir}`);
  return resolve(drizzleDir, latest);
}

function normalizeSql(sql: string): string {
  // MySQL 5.7 不支持 DEFAULT (now())，需要使用 DEFAULT CURRENT_TIMESTAMP。
  return sql.replace(/DEFAULT\s+\(now\(\)\)/gi, "DEFAULT CURRENT_TIMESTAMP");
}

function isIgnorableMigrationError(err: unknown): boolean {
  const e = err as { errno?: number; code?: string; message?: string };
  return (
    e.errno === 1050 || // table already exists
    e.errno === 1060 || // duplicate column
    e.errno === 1061 || // duplicate key name
    e.errno === 1826 || // duplicate foreign key constraint name
    e.code === "ER_TABLE_EXISTS_ERROR" ||
    e.code === "ER_DUP_FIELDNAME" ||
    e.code === "ER_DUP_KEYNAME" ||
    e.code === "ER_FK_DUP_NAME" ||
    /already exists|Duplicate/i.test(e.message || "")
  );
}

async function main() {
  const migration = latestMigrationFile();
  const sql = normalizeSql(readFileSync(migration, "utf8"));
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "bicli",
  });

  console.log(`[db:push] applying ${statements.length} statements from ${migration}`);
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await conn.query(stmt);
      } catch (err) {
        if (isIgnorableMigrationError(err)) {
          console.log(`[db:push] skip existing object at statement ${i + 1}`);
          continue;
        }
        console.error(`[db:push] failed at statement ${i + 1}:`);
        console.error(stmt);
        throw err;
      }
    }
    console.log("[db:push] done");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
