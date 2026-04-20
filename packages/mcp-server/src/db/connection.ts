import "../env.js";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export type Database = MySql2Database<typeof schema>;

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "bicli",
  });

  db = drizzle(pool, { schema, mode: "default" });
  return db;
}
