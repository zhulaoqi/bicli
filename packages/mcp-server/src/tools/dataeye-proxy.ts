import type { ToolContext } from "../types/index.js";

const DATAEYE_API_URL = () => process.env.DATAEYE_API_URL || "";
const DATAEYE_API_TIMEOUT = () => parseInt(process.env.DATAEYE_API_TIMEOUT || "10000", 10);
const DATAEYE_MAX_RETRIES = () => parseInt(process.env.DATAEYE_MAX_RETRIES || "3", 10);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 判断当前错误是否可重试（网络错误、超时、5xx） */
function isRetryable(err: unknown, status?: number): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err.name === "FetchError" || err.message.includes("fetch")) return true;
    if (err.message.includes("ECONNRESET") || err.message.includes("ETIMEDOUT") || err.message.includes("ENOTFOUND")) return true;
    // 5xx 服务端错误可重试，4xx 业务错误不重试
    if (status !== undefined && status >= 500) return true;
  }
  return false;
}

/**
 * 代理 dataeye 后端 API（JWT 透传，自动重试）
 */
export async function dateyeRequest<T = unknown>(
  path: string,
  context: ToolContext,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    params?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const baseUrl = DATAEYE_API_URL().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("DATAEYE_API_URL not configured");

  let url = `${baseUrl}${path}`;
  if (options.params) {
    const qs = Object.entries(options.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const maxRetries = DATAEYE_MAX_RETRIES();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避：1s, 2s, 4s
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (context.token) {
      headers.Authorization = `Bearer ${context.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DATAEYE_API_TIMEOUT());

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
        const err = new Error(`Dataeye ${resp.status}: ${text.slice(0, 300)}`);
        if (isRetryable(err, resp.status) && attempt < maxRetries) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const json = await resp.json() as Record<string, unknown>;
      // dataeye RestResult 标准格式: { code: 200, message: "...", data: ... }
      if (json && typeof json === "object" && "code" in json) {
        if (json.code !== 200 && json.code !== 0) {
          throw new Error(`Dataeye business error [${json.code}]: ${(json as any).message || "unknown"}`);
        }
        if ("data" in json) return json.data as T;
      }
      return json as unknown as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        const timeoutErr = new Error(`Dataeye API timeout: ${url}`);
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
