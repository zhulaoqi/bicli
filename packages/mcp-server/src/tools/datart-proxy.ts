import type { ToolContext } from "../types/index.js";

const DATART_API_URL = () => process.env.DATART_API_URL || "";
const DATART_API_TIMEOUT = () => parseInt(process.env.DATART_API_TIMEOUT || "15000", 10);
const DATART_MAX_RETRIES = () => parseInt(process.env.DATART_MAX_RETRIES || "3", 10);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown, status?: number): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err.name === "FetchError" || err.message.includes("fetch")) return true;
    if (err.message.includes("ECONNRESET") || err.message.includes("ETIMEDOUT") || err.message.includes("ENOTFOUND")) return true;
    if (status !== undefined && status >= 500) return true;
  }
  return false;
}

/**
 * 代理 Datart 后端 API（JWT 透传，与 DataEye 同一套登录态，自动重试）
 * Datart 统一响应格式: { success: true/false, errCode, message, data }
 */
export async function datartRequest<T = unknown>(
  path: string,
  context: ToolContext,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    params?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const baseUrl = DATART_API_URL().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("DATART_API_URL not configured. 请在 .env 中设置 DATART_API_URL");

  let url = `${baseUrl}${path}`;
  if (options.params) {
    const qs = Object.entries(options.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const maxRetries = DATART_MAX_RETRIES();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    // Datart 的 Authorization header 直接是 token，不加 Bearer 前缀
    const token = process.env.DATART_API_TOKEN || context.token;
    if (token) headers.Authorization = token;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DATART_API_TIMEOUT());

    try {
      const init: RequestInit = {
        method: options.method || (options.body ? "POST" : "GET"),
        headers,
        signal: controller.signal,
      };
      if (options.body) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }

      const resp = await fetch(url, init);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const err = new Error(`Datart ${resp.status}: ${text.slice(0, 300)}`);
        if (isRetryable(err, resp.status) && attempt < maxRetries) {
          lastErr = err;
          continue;
        }
        throw err;
      }

      const json = await resp.json() as Record<string, unknown>;
      // Datart 标准格式: { success: true, data: ... } 或 { success: false, message: ... }
      if (json && typeof json === "object" && "success" in json) {
        if (json.success === false) {
          throw new Error(`Datart error: ${(json as any).message || (json as any).errCode || "unknown"}`);
        }
        if ("data" in json) return json.data as T;
      }
      return json as unknown as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        const timeoutErr = new Error(`Datart API timeout (${DATART_API_TIMEOUT()}ms): ${url}`);
        if (attempt < maxRetries) { lastErr = timeoutErr; continue; }
        throw timeoutErr;
      }
      if (isRetryable(err) && attempt < maxRetries) {
        lastErr = err;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr;
}
