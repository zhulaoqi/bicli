import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "./adapter.js";
import { LocalPermissionAdapter } from "./local-adapter.js";
import { HttpPermissionAdapter } from "./http-adapter.js";
import { DataeyePermissionAdapter } from "./dataeye-adapter.js";

export function createPermissionAdapter(db: Database): PermissionAdapter {
  const mode = process.env.PERMISSION_MODE || "local";

  if (mode === "dataeye") {
    const baseUrl = process.env.DATAEYE_API_URL;
    if (!baseUrl) {
      throw new Error("PERMISSION_MODE=dataeye requires DATAEYE_API_URL environment variable");
    }
    const timeout = parseInt(process.env.DATAEYE_API_TIMEOUT || "5000", 10);
    console.error(`[auth] Using DataeyePermissionAdapter → ${baseUrl} (timeout: ${timeout}ms)`);
    return new DataeyePermissionAdapter(baseUrl, timeout);
  }

  if (mode === "http") {
    const baseUrl = process.env.PERMISSION_API_URL;
    if (!baseUrl) {
      throw new Error("PERMISSION_MODE=http requires PERMISSION_API_URL environment variable");
    }
    const timeout = parseInt(process.env.PERMISSION_API_TIMEOUT || "5000", 10);
    console.error(`[auth] Using HttpPermissionAdapter → ${baseUrl} (timeout: ${timeout}ms)`);
    return new HttpPermissionAdapter(baseUrl, timeout);
  }

  console.error("[auth] Using LocalPermissionAdapter (database)");
  return new LocalPermissionAdapter(db);
}
