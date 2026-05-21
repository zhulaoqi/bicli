#!/usr/bin/env node
import "./env.js";
import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getDb } from "./db/connection.js";
import { registerTools } from "./tools/register.js";
import { createPermissionAdapter } from "./auth/create-adapter.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SessionStore } from "./chat/session-store.js";
import { handleChatStream, type StreamToolSpec } from "./chat/stream.js";
import { listBuiltinModels, guessProvider, defaultModel, type ModelOption, type CustomModelRecord } from "./chat/models-registry.js";
import { customModels as customModelsTable } from "./db/schema.js";
import { eq, and } from "drizzle-orm";
import { buildSystemPrompt as buildSP } from "./chat/system-prompt.js";
import { routeDataEyeHelpSkill } from "./chat/skill-routing.js";
import { buildPageContextPrompt, hasPageContextEvidence, sanitizePageContext } from "./chat/page-context.js";
import { buildPermissionScopeKey, filterHistoryForScope } from "./chat/history-scope.js";
import { loadChatToolRegistry } from "./tools/tool-domain-registry.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3211", 10);
const HOST = process.env.MCP_HTTP_HOST || "0.0.0.0";
const BASE_PATH = normalizeBasePath(process.env.MCP_BASE_PATH ?? "/bicli-mcp");

const transports: Record<string, StreamableHTTPServerTransport> = {};

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

function stripBasePath(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!BASE_PATH) return next();
  const url = req.url;
  if (url === BASE_PATH) {
    req.url = "/";
  } else if (url.startsWith(`${BASE_PATH}/`) || url.startsWith(`${BASE_PATH}?`)) {
    req.url = url.slice(BASE_PATH.length) || "/";
  }
  next();
}

async function createMcpServer() {
  const server = new Server(
    { name: "bicli-mcp-server", version: "2.0.0" },
    { capabilities: { tools: {} } },
  );
  const db = await getDb();
  const adapter = createPermissionAdapter(db);
  registerTools(server, db, adapter);
  return server;
}

async function main() {
  const app = express();

  // 统一支持 Ingress 前缀路径：/bicli-mcp/chat/stream -> /chat/stream。
  // 保留无前缀路由，方便本地调试和服务间直连。
  app.use(stripBasePath);

  app.use(cors({
    origin: process.env.MCP_CORS_ORIGIN || "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "mcp-session-id", "Authorization"],
    exposedHeaders: ["mcp-session-id"],
  }));
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) delete transports[sid];
      };

      const server = await createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      if (transport.sessionId) {
        transports[transport.sessionId] = transport;
      }
      return;
    }

    res.status(400).json({ error: "Bad request: missing mcp-session-id or not an initialize request" });
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Missing or invalid session ID" });
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
      delete transports[sessionId];
      return;
    }
    res.status(404).json({ error: "Session not found" });
  });

  // ─── /chat — 聊天 API（服务端 LLM 编排 + 工具调用）───
  // 前端只需传 message + JWT，服务端完成所有 AI 编排
  app.post("/chat", async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }

    const { message, history = [] } = req.body as {
      message: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      await initToolHandlers();
      const db = await getDb();
      const adapter = createPermissionAdapter(db);
      const credential = { type: "token" as const, token };
      const identity = await adapter.resolveIdentity(credential);
      const permissions = await adapter.getPermissions(identity.role);

      const routed = routeDataEyeHelpSkill(message, permissions, toolDefCache);
      const systemPrompt = [
        buildSystemPrompt(identity, permissions, routed.tools),
        routed.skillPrompt,
      ].filter(Boolean).join("\n\n---\n\n");
      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      const result = await chatWithTools(messages, routed.tools, token, db, adapter);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[chat] Error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // ─── /chat/models — 返回内置 + 当前用户的自定义模型 ───
  app.get("/chat/models", async (req, res) => {
    try {
      const identity = await resolveIdentityFromReq(req);
      const userId = identity ? String(identity.userId) : null;
      const rows = userId
        ? await db0.select().from(customModelsTable)
            .where(eq(customModelsTable.createdBy, userId))
            .orderBy(customModelsTable.createdAt)
        : [];
      const dbModels: ModelOption[] = rows.map((r) => ({
        id: r.modelId,
        name: r.name,
        provider: "custom" as const,
        tags: ["自定义"],
        supportsTools: true,
        available: true,
      }));
      res.json({ models: [...listBuiltinModels(), ...dbModels], default: defaultModel() });
    } catch {
      // 查询失败时至少返回内置模型
      res.json({ models: listBuiltinModels(), default: defaultModel() });
    }
  });

  // ─── /chat/custom-models — 自定义模型 CRUD（仅操作自己的） ───
  app.get("/chat/custom-models", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    const userId = identity ? String(identity.userId) : null;
    if (!userId) return res.json({ models: [] });
    const rows = await db0.select().from(customModelsTable)
      .where(eq(customModelsTable.createdBy, userId))
      .orderBy(customModelsTable.createdAt);
    res.json({ models: rows.map((r) => ({ ...r, apiKey: r.apiKey.slice(0, 4) + "****" })) });
  });

  app.post("/chat/custom-models", async (req, res) => {
    const { modelId, name, endpoint, apiKey } = req.body as Partial<CustomModelRecord>;
    if (!modelId || !name || !endpoint || !apiKey) {
      return res.status(400).json({ error: "modelId, name, endpoint, apiKey 均为必填" });
    }
    const identity = await resolveIdentityFromReq(req);
    const createdBy = identity ? String(identity.userId) : null;
    if (!createdBy) return res.status(401).json({ error: "未登录，无法添加自定义模型" });
    try {
      await db0.insert(customModelsTable).values({ modelId, name, endpoint, apiKey, createdBy });
      const [row] = await db0.select().from(customModelsTable).where(
        and(eq(customModelsTable.modelId, modelId), eq(customModelsTable.createdBy, createdBy))
      );
      res.json(row);
    } catch (e: any) {
      // Drizzle 会把 MySQL 错误包成 "Failed query: ..."，需要递归检查
      const fullMsg = [e?.message, e?.cause?.message, String(e)].join(" ");
      if (fullMsg.includes("Duplicate") || fullMsg.includes("ER_DUP_ENTRY")) {
        return res.status(409).json({ error: `你已添加过模型 ID "${modelId}"，请直接在下拉菜单中选择` });
      }
      throw e;
    }
  });

  app.delete("/chat/custom-models/:modelId", async (req, res) => {
    const { modelId } = req.params;
    const identity = await resolveIdentityFromReq(req);
    const userId = identity ? String(identity.userId) : null;
    if (!userId) return res.status(401).json({ error: "未登录" });
    await db0.delete(customModelsTable).where(
      and(eq(customModelsTable.modelId, modelId), eq(customModelsTable.createdBy, userId))
    );
    res.json({ ok: true });
  });

  // ─── /chat/tool — 单次同步工具调用（供前端表单使用，不走 LLM 流）───
  app.post("/chat/tool", async (req, res) => {
    const { toolName, args = {} } = req.body as { toolName?: string; args?: Record<string, unknown> };
    if (!toolName) return res.status(400).json({ ok: false, error: "toolName 为必填" });

    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ ok: false, error: "未登录" });

    await initToolHandlers();
    const handler = toolHandlerMap[toolName];
    if (!handler) return res.status(404).json({ ok: false, error: `工具不存在：${toolName}` });

    const token = extractBearerToken(req)!;
    const injectedArgs = {
      ...args,
      _context: {
        ...(((args as Record<string, unknown>)._context as Record<string, unknown>) || {}),
        token,
        userId: identity.userId,
        role: identity.role,
        orgId: identity.orgId,
      },
    };

    try {
      const result = await handler(db0, adapter0, injectedArgs);
      const text = (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
      const parsed = text ? JSON.parse(text) : result;
      res.json({ ok: true, data: parsed });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ─── /chat/custom-models/test-saved — 测试已保存的模型（从 DB 取原始 key）───
  app.post("/chat/custom-models/test-saved", async (req, res) => {
    const { modelId } = req.body as { modelId?: string };
    if (!modelId) return res.status(400).json({ ok: false, error: "modelId 为必填" });
    const identity = await resolveIdentityFromReq(req);
    const userId = identity ? String(identity.userId) : null;
    if (!userId) return res.status(401).json({ ok: false, error: "未登录" });
    const [row] = await db0.select().from(customModelsTable).where(
      and(eq(customModelsTable.modelId, modelId), eq(customModelsTable.createdBy, userId))
    );
    if (!row) return res.status(404).json({ ok: false, error: "模型不存在或无权限" });
    const start = Date.now();
    try {
      const testUrl = row.endpoint.replace(/\/$/, "") + "/chat/completions";
      const resp = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${row.apiKey}` },
        body: JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return res.json({ ok: false, error: `HTTP ${resp.status}：${body.slice(0, 200)}`, latency });
      }
      const data = await resp.json().catch(() => ({}));
      const reply = (data as any)?.choices?.[0]?.message?.content ?? "(无内容)";
      return res.json({ ok: true, latency, reply: reply.slice(0, 80) });
    } catch (e: any) {
      return res.json({ ok: false, error: e?.message || String(e), latency: Date.now() - start });
    }
  });

  // ─── /chat/custom-models/test — 测试自定义模型连通性 ───
  app.post("/chat/custom-models/test", async (req, res) => {
    const { endpoint, apiKey, modelId } = req.body as {
      endpoint?: string; apiKey?: string; modelId?: string;
    };
    if (!endpoint || !apiKey || !modelId) {
      return res.status(400).json({ ok: false, error: "endpoint、apiKey、modelId 均为必填" });
    }
    const start = Date.now();
    try {
      const testUrl = endpoint.replace(/\/$/, "") + "/chat/completions";
      const resp = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 5,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return res.json({ ok: false, error: `HTTP ${resp.status}：${body.slice(0, 200)}`, latency });
      }
      const data = await resp.json().catch(() => ({}));
      const reply = (data as any)?.choices?.[0]?.message?.content ?? "(无内容)";
      return res.json({ ok: true, latency, reply: reply.slice(0, 80) });
    } catch (e: any) {
      const latency = Date.now() - start;
      return res.json({ ok: false, error: e?.message || String(e), latency });
    }
  });

  // ─── /session/* — 会话 CRUD ───
  const db0 = await getDb();
  const adapter0 = createPermissionAdapter(db0);
  const store = new SessionStore(db0);

  const resolveIdentityFromReq = async (req: express.Request) => {
    const token = extractBearerToken(req);
    if (!token) return null;
    try {
      const id = await adapter0.resolveIdentity({ type: "token", token });
      return id;
    } catch {
      return null;
    }
  };

  app.post("/session/create", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    const model = (req.body?.model as string) || defaultModel();
    const title = (req.body?.title as string) || undefined;
    const s = await store.create(String(identity.userId), identity.orgId, model, title);
    res.json(s);
  });

  app.get("/session/list", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    const list = await store.list(String(identity.userId), 50);
    res.json({ sessions: list });
  });

  app.get("/session/:id", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    const sid = Number(req.params.id);
    if (!Number.isFinite(sid)) return res.status(400).json({ error: "invalid id" });
    const s = await store.get(sid);
    if (!s || s.userId !== String(identity.userId)) {
      return res.status(404).json({ error: "not found" });
    }
    const messages = await store.getMessages(sid);
    res.json({ session: s, messages });
  });

  app.patch("/session/:id", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    const sid = Number(req.params.id);
    const s = await store.get(sid);
    if (!s || s.userId !== String(identity.userId)) {
      return res.status(404).json({ error: "not found" });
    }
    const { title, model } = req.body as { title?: string; model?: string };
    if (title) await store.updateTitle(sid, title);
    if (model) await store.updateModel(sid, model);
    res.json(await store.get(sid));
  });

  app.delete("/session/:id", async (req, res) => {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    const sid = Number(req.params.id);
    await store.delete(sid, String(identity.userId));
    res.json({ ok: true });
  });

  // ─── /chat/stream — SSE 流式聊天 ───
  app.post("/chat/stream", async (req, res) => { try {
    const identity = await resolveIdentityFromReq(req);
    if (!identity) return res.status(401).json({ error: "unauthorized" });

    const { sessionId: rawSid, message, model: reqModel, pageContext } = req.body as {
      sessionId: number | string;
      message: string;
      model?: string;
      pageContext?: unknown;
    };
    const sid = Number(rawSid);
    if (!message) return res.status(400).json({ error: "message is required" });
    if (!Number.isFinite(sid)) return res.status(400).json({ error: "invalid sessionId" });

    const session = await store.get(sid);
    if (!session || session.userId !== String(identity.userId)) {
      return res.status(404).json({ error: "session not found" });
    }

    if (reqModel && reqModel !== session.model) {
      await store.updateModel(sid, reqModel);
    }
    const usedModel = reqModel || session.model || defaultModel();

    await initToolHandlers();
    const token = extractBearerToken(req)!;
    const permissions = await adapter0.getPermissions(identity.role);
    const currentScopeKey = buildPermissionScopeKey({
      userId: identity.userId,
      orgId: identity.orgId,
      role: identity.role,
      permissions,
    });
    const sessionMetadata = (session.metadata && typeof session.metadata === "object")
      ? session.metadata as Record<string, unknown>
      : {};
    const sessionScopeKey = typeof sessionMetadata.permissionScopeKey === "string"
      ? sessionMetadata.permissionScopeKey
      : null;
    if (sessionScopeKey !== currentScopeKey) {
      await store.updateMetadata(sid, {
        ...sessionMetadata,
        permissionScopeKey: currentScopeKey,
        permissionScopeUpdatedAt: new Date().toISOString(),
      });
    }
    const routed = routeDataEyeHelpSkill(message, permissions, toolDefCache);
    const sanitizedPageContext = sanitizePageContext(pageContext);
    const pageContextPrompt = buildPageContextPrompt(sanitizedPageContext.context);
    if (sanitizedPageContext.context) {
      console.log("[page-context]", {
        pageType: sanitizedPageContext.context.pageType,
        selectedChartId: sanitizedPageContext.context.selectedChartId,
        chartCount: sanitizedPageContext.context.charts?.length ?? 0,
        warnings: sanitizedPageContext.warnings,
      });
    }
    const systemPrompt = [
      buildSP(
        { userId: identity.userId, role: identity.role, orgId: identity.orgId },
        permissions,
        routed.tools,
      ),
      routed.skillPrompt,
      pageContextPrompt,
    ].filter(Boolean).join("\n\n---\n\n");

    // stream.ts 会在开始时 addMessage(user) — 所以此处只需拿入库前的历史即可
    // 对 assistant 消息：若存在工具调用记录，把工具名注入到 content 前缀，
    // 防止 LLM 在历史回放中看不到工具证据而产生"说✅成功不需要调工具"的幻觉。
    const rawHistory = (await store.getMessages(sid))
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        let content = m.content ?? "";
        if (m.role === "assistant" && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
          const toolSummary = m.toolCalls
            .map((t) => `${t.name}:${t.status === "done" ? "ok" : t.status}`)
            .join("|");
          // 注入工具调用证据：使用 XML 注释格式，避免模型在新回复中模仿此格式
          content = `<!--tool_history:${toolSummary}-->\n${content}`;
        }
        return { role: m.role as "user" | "assistant", content };
      });
    const history = filterHistoryForScope(rawHistory, {
      sessionScopeKey,
      currentScopeKey,
    });

    const toolSpecs: StreamToolSpec[] = routed.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      routeHints: t.routeHints,
      knowledgeOnly: t.knowledgeOnly,
      destructive: t.destructive,
      tier: t.tier,
      domain: t.domain,
      execute: async (args) => {
        const handler = toolHandlerMap[t.name];
        if (!handler) {
          return JSON.stringify({
            success: false,
            error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${t.name}` },
          });
        }
        const injectedArgs = {
          ...args,
          _context: {
            ...(((args as Record<string, unknown>)._context as Record<string, unknown>) || {}),
            token,
            userId: identity.userId,
            role: identity.role,
            orgId: identity.orgId,
          },
        };
        const result = await handler(db0, adapter0, injectedArgs);
        const text =
          (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ??
          JSON.stringify(result);
        return text;
      },
    }));

    // ① 先查 DB：是否是当前用户自己添加的自定义模型
    //    必须先查 DB，否则 gpt-*/claude-* 前缀的自定义模型会被误识别为内置 OpenAI/Anthropic
    let customConfig: { endpoint: string; apiKey: string; model: string } | undefined;
    try {
      const userId = identity?.userId ? String(identity.userId) : null;
      const [dbCustom] = await db0.select().from(customModelsTable)
        .where(and(
          eq(customModelsTable.modelId, usedModel),
          ...(userId ? [eq(customModelsTable.createdBy, userId)] : [])
        ));
      if (dbCustom) {
        customConfig = { endpoint: dbCustom.endpoint, apiKey: dbCustom.apiKey, model: usedModel };
      } else if (process.env.CUSTOM_API_URL && process.env.CUSTOM_MODEL === usedModel) {
        customConfig = {
          endpoint: process.env.CUSTOM_API_URL,
          apiKey: process.env.CUSTOM_API_KEY || process.env.CUSTOM_MODEL_API_KEY || "",
          model: usedModel,
        };
      }
    } catch (dbErr) {
      console.warn("[stream] custom model DB lookup failed, falling back to built-in provider:", dbErr);
      // 降级：用环境变量兜底
      if (process.env.CUSTOM_API_URL && process.env.CUSTOM_MODEL === usedModel) {
        customConfig = {
          endpoint: process.env.CUSTOM_API_URL,
          apiKey: process.env.CUSTOM_API_KEY || process.env.CUSTOM_MODEL_API_KEY || "",
          model: usedModel,
        };
      }
    }

    // ② 只有查不到自定义配置时，才根据名字猜内置 provider
    const provider = customConfig ? "custom" : guessProvider(usedModel);

    await handleChatStream({
      res,
      sessionId: sid,
      userMessage: message,
      model: usedModel,
      provider,
      systemPrompt,
      history,
      tools: toolSpecs,
      store,
      skipNoToolListGuard: (routed.skill?.name.startsWith("dataeye-help-") ?? false) || hasPageContextEvidence(sanitizedPageContext.context),
      hasPageContextEvidence: hasPageContextEvidence(sanitizedPageContext.context),
      customConfig,
      preferredToolNames: (routed.skill?.requiredTools ?? []).filter(Boolean),
      scopeFingerprint: currentScopeKey,
    });
  } catch (e: any) {
    console.error("[/chat/stream] unhandled error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e?.message || String(e) });
    } else {
      res.end();
    }
  }
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "2.0.0",
      transport: "http",
      activeSessions: Object.keys(transports).length,
    });
  });

  app.get("/", (_req, res) => {
    res.type("html").send(buildDemoHTML(PORT));
  });

  app.listen(PORT, HOST, () => {
    console.log(`\n  BiCLI MCP HTTP Server`);
    console.log(`  ─────────────────────────`);
    console.log(`  Endpoint:  http://${HOST}:${PORT}/mcp`);
    if (BASE_PATH) console.log(`  BasePath:  ${BASE_PATH}`);
    console.log(`  Health:    http://${HOST}:${PORT}/health`);
    console.log(`  CORS:      ${process.env.MCP_CORS_ORIGIN || "*"}`);
    console.log(`  ─────────────────────────\n`);
  });

  // 启动时预热：加载所有工具模块，避免第一次 /chat/stream 请求时才做 dynamic import
  initToolHandlers()
    .then(() => console.log(`[warmup] tool handlers ready`))
    .catch((e) => console.error(`[warmup] failed to init tool handlers:`, e));
}

main().catch((err) => {
  console.error("Failed to start MCP HTTP Server:", err);
  process.exit(1);
});

// ─── Chat API helpers ───

function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function buildSystemPrompt(
  identity: { userId: string | number; role: string; orgId?: string },
  permissions: string[],
  toolDefs: ToolDefinition[],
): string {
  const toolList = toolDefs.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `你是 DataEye AI 助手，嵌入在数据分析平台中。
当前用户: ID=${identity.userId}, 角色=${identity.role}, 组织=${identity.orgId || "unknown"}
用户权限: ${permissions.join(", ")}

可用工具:
${toolList}

重要规则:
1. 所有工具调用会自动注入用户身份和 token，你无需关心权限传递
2. 使用中文回复
3. 数据查询先用 dataeye_project_list 确定项目/产品，再用具体工具
4. SQL 查询先用 dataeye_datasource_list 获取 sourceId`;
}

type ToolDefinition = import("./tools/tool-domain-registry.js").ToolDefinition;

interface ChatResult {
  content: string;
  toolCalls?: Array<{ name: string; status: string }>;
}

type LLMMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/**
 * LLM + MCP 工具调用编排
 * 支持多轮 function calling：LLM → tool → LLM → tool → ... → final response
 */
async function chatWithTools(
  messages: LLMMessage[],
  toolDefs: ToolDefinition[],
  token: string,
  db: any,
  adapter: any,
  depth = 0,
): Promise<ChatResult> {
  if (depth > 8) return { content: "已达到最大工具调用深度（8轮），请缩小问题范围重试。" };

  let apiUrl = process.env.CUSTOM_API_URL || process.env.LLM_API_URL;
  const apiKey = process.env.CUSTOM_API_KEY || process.env.ALIBABA_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.CUSTOM_MODEL || process.env.LLM_MODEL || "qwen-plus";

  if (!apiUrl && process.env.ALIBABA_API_KEY) {
    apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  } else if (!apiUrl && process.env.OPENAI_API_KEY) {
    apiUrl = "https://api.openai.com/v1";
  }

  if (!apiUrl || !apiKey) {
    return { content: "LLM 未配置（需要设置 CUSTOM_API_URL + CUSTOM_API_KEY 环境变量）" };
  }

  const openaiTools = toolDefs.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const resp = await fetch(`${apiUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
      };
      finish_reason?: string;
    }>;
  };

  const choice = data.choices?.[0];
  const assistantMessage = choice?.message;
  if (!assistantMessage) return { content: "（无响应）" };

  // 无工具调用 → 直接返回文本
  if (!assistantMessage.tool_calls?.length) {
    return { content: assistantMessage.content || "（无响应）" };
  }

  // 有工具调用 → 执行后继续对话
  const collectedCalls: ChatResult["toolCalls"] = [];
  messages.push({
    role: "assistant",
    content: assistantMessage.content || null,
    tool_calls: assistantMessage.tool_calls,
  });

  for (const tc of assistantMessage.tool_calls) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.function.arguments); } catch {}

    // 注入 token — 这是关键！前端的 JWT 透传到每个工具调用
    args._context = { ...(args._context as Record<string, unknown> || {}), token };

    let toolResult: string;
    let status = "done";
    try {
      const handler = getToolHandler(tc.function.name);
      if (handler) {
        const result = await handler(db, adapter, args);
        toolResult = result?.content?.[0]?.text || JSON.stringify(result);
      } else {
        toolResult = JSON.stringify({ success: false, error: { message: `Tool not found: ${tc.function.name}` } });
        status = "error";
      }
    } catch (err) {
      toolResult = JSON.stringify({ success: false, error: { message: err instanceof Error ? err.message : "Unknown error" } });
      status = "error";
    }

    collectedCalls.push({ name: tc.function.name, status });
    messages.push({ role: "tool", content: toolResult, tool_call_id: tc.id });
  }

  // 递归：带工具结果继续让 LLM 生成最终回复
  const nextResult = await chatWithTools(messages, toolDefs, token, db, adapter, depth + 1);
  return {
    content: nextResult.content,
    toolCalls: [...collectedCalls, ...(nextResult.toolCalls || [])],
  };
}

/**
 * 获取工具执行函数的引用（直接调用，不走 MCP 协议）
 */
function getToolHandler(name: string): ((db: any, adapter: any, args: Record<string, unknown>) => Promise<any>) | null {
  return toolHandlerMap[name] || null;
}

// 延迟初始化工具映射（避免循环依赖）
let toolHandlerMap: Record<string, (db: any, adapter: any, args: Record<string, unknown>) => Promise<any>> = {};
let toolDefCache: ToolDefinition[] = [];

async function initToolHandlers() {
  if (Object.keys(toolHandlerMap).length > 0) return;

  const registry = await loadChatToolRegistry(process.env);
  toolHandlerMap = registry.handlers;
  toolDefCache = registry.definitions;
  console.error(`[chat] Initialized ${toolDefCache.length} tool handlers for /chat endpoint`);
}

function buildDemoHTML(port: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BiCLI Embed Demo</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--dim:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922;--blue:#1f6feb}
  body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex}
  #sidebar{width:280px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
  #sidebar h2{padding:16px;font-size:14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
  #sidebar h2 .logo{color:var(--accent);font-weight:700;font-size:16px}
  #config{padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px}
  .field{display:flex;flex-direction:column;gap:4px}
  .field label{font-size:12px;color:var(--dim);font-weight:500}
  .field input,.field select{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px;outline:none}
  .field input:focus,.field select:focus{border-color:var(--accent)}
  .btn{padding:10px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s}
  .btn-primary{background:var(--accent);color:#fff}
  .btn-primary:hover{opacity:.85}
  .btn-primary:disabled{opacity:.4;cursor:not-allowed}
  .btn-secondary{background:var(--border);color:var(--text)}
  .btn-secondary:hover{background:#3d444d}
  #status{padding:12px 16px;border-top:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:4px}
  .status-row{display:flex;align-items:center;gap:6px}
  .dot{width:7px;height:7px;border-radius:50%;display:inline-block}
  .dot.on{background:var(--green)} .dot.off{background:var(--red)}
  #main{flex:1;display:flex;flex-direction:column}
  #header{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;gap:20px;font-size:13px}
  #chat{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
  .msg{max-width:80%;padding:10px 14px;border-radius:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;font-size:14px}
  .msg.user{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:4px}
  .msg.assistant{align-self:flex-start;background:var(--surface);border:1px solid var(--border);border-bottom-left-radius:4px}
  .msg.system{align-self:stretch;background:transparent;color:var(--dim);font-size:12px;font-family:'SF Mono',monospace;border:1px solid var(--border);border-radius:8px;padding:8px 12px}
  .msg .tool-tag{display:inline-block;background:#30363d;color:var(--yellow);padding:2px 6px;border-radius:4px;font-size:11px;margin-bottom:4px}
  #input-area{border-top:1px solid var(--border);padding:12px 20px;display:flex;gap:8px;background:var(--surface)}
  #input{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-family:inherit;font-size:14px;outline:none;resize:none;min-height:44px;max-height:120px}
  #input:focus{border-color:var(--accent)}
  #user-select{display:flex;gap:8px;align-items:center}
</style>
</head>
<body>
<div id="sidebar">
  <h2><span class="logo">BiCLI</span> Embed Demo</h2>
  <div id="config">
    <div style="font-size:12px;color:var(--dim);padding:4px 0;border-bottom:1px solid var(--border)">LLM 配置</div>
    <div class="field"><label>API Endpoint</label><input id="llm-endpoint" value="https://dashscope.aliyuncs.com/compatible-mode/v1" placeholder="https://..."></div>
    <div class="field"><label>Model</label><input id="llm-model" value="qwen-plus" placeholder="gpt-4 / qwen-plus"></div>
    <div class="field"><label>API Key</label><input id="llm-key" type="password" placeholder="sk-xxx"></div>
    <div style="font-size:12px;color:var(--dim);padding:4px 0;border-bottom:1px solid var(--border);margin-top:8px">用户身份</div>
    <div class="field"><label>User ID</label><input id="user-id" type="number" value="1"></div>
    <div class="field"><label>角色</label>
      <select id="user-role"><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select>
    </div>
    <button class="btn btn-primary" id="connect-btn" onclick="doConnect()">连接</button>
    <button class="btn btn-secondary" onclick="doDisconnect()" id="disconnect-btn" disabled>断开</button>
  </div>
  <div id="status">
    <div class="status-row"><span class="dot off" id="dot-mcp"></span> MCP: <span id="st-mcp">未连接</span></div>
    <div class="status-row"><span class="dot off" id="dot-llm"></span> LLM: <span id="st-llm">未配置</span></div>
    <div class="status-row">工具数: <span id="st-tools">0</span></div>
  </div>
</div>
<div id="main">
  <div id="header">
    <span style="font-weight:600;color:var(--accent)">对话</span>
    <span id="hdr-model" style="color:var(--dim)">-</span>
    <span id="hdr-role" style="color:#d2a8ff">-</span>
    <span style="flex:1"></span>
    <button class="btn btn-secondary" onclick="clearChat()" style="padding:6px 12px;font-size:12px">清空对话</button>
  </div>
  <div id="chat"><div class="msg system">👋 配置左侧 LLM 参数后点击「连接」开始体验嵌入式 AI 能力。<br><br>这是 BiCLI 嵌入模式的 Demo：<br>• MCP 通过 HTTP 协议通信（不依赖 Node.js stdio）<br>• LLM 直接从浏览器调用（Vercel AI SDK 兼容 API）<br>• 会话持久化存储在数据库中（按用户隔离）<br>• 切换 User ID / 角色 可测试不同权限</div></div>
  <div id="input-area">
    <textarea id="input" rows="1" placeholder="输入消息..." disabled></textarea>
    <button class="btn btn-primary" id="send-btn" onclick="doSend()" disabled>发送</button>
  </div>
</div>
<script>
const MCP_URL = location.origin + "/mcp";
let mcpSessionId = null, tools = [], busy = false, messages = [], currentEl = null;

async function mcpRequest(method, params, id) {
  const body = {jsonrpc:"2.0", method, ...(id !== undefined ? {id} : {}), ...(params ? {params} : {})};
  const headers = {"Content-Type":"application/json", Accept:"application/json, text/event-stream"};
  if (mcpSessionId) headers["mcp-session-id"] = mcpSessionId;
  const resp = await fetch(MCP_URL, {method:"POST", headers, body:JSON.stringify(body)});
  const sid = resp.headers.get("mcp-session-id");
  if (sid) mcpSessionId = sid;
  const text = await resp.text();
  const lines = text.split("\\n").filter(l => l.startsWith("data: "));
  if (lines.length) return JSON.parse(lines[0].slice(6));
  if (text.trim()) try { return JSON.parse(text); } catch(e) {}
  return null;
}

async function mcpCallTool(name, args) {
  const userId = Number(document.getElementById("user-id").value);
  const role = document.getElementById("user-role").value;
  const r = await mcpRequest("tools/call", {name, arguments:{...args, _context:{userId, role}}}, Date.now());
  if (r?.result?.content?.[0]?.text) return JSON.parse(r.result.content[0].text);
  return r;
}

async function doConnect() {
  addMsg("system", "正在连接 MCP Server...");
  try {
    mcpSessionId = null;
    const initResp = await mcpRequest("initialize", {protocolVersion:"2025-03-26", capabilities:{}, clientInfo:{name:"demo",version:"1.0.0"}}, 1);
    if (!initResp?.result) throw new Error("Initialize failed");
    setMcpStatus(true);
    await mcpRequest("notifications/initialized");
    const toolsResp = await mcpRequest("tools/list", {}, 2);
    tools = toolsResp?.result?.tools || [];
    document.getElementById("st-tools").textContent = tools.length;
    addMsg("system", "✅ MCP 已连接，可用工具 " + tools.length + " 个:\\n" + tools.map(t => "  • " + t.name).join("\\n"));
    const key = document.getElementById("llm-key").value;
    const model = document.getElementById("llm-model").value;
    if (key) {
      setLlmStatus(true, model);
      addMsg("system", "✅ LLM 已配置: " + model);
    } else {
      setLlmStatus(false);
      addMsg("system", "⚠️ 未配置 API Key，只能使用 MCP 工具（无 AI 对话）");
    }
    document.getElementById("hdr-model").textContent = model;
    document.getElementById("hdr-role").textContent = document.getElementById("user-role").value;
    document.getElementById("input").disabled = false;
    document.getElementById("send-btn").disabled = false;
    document.getElementById("connect-btn").disabled = true;
    document.getElementById("disconnect-btn").disabled = false;
  } catch(e) {
    addMsg("system", "❌ 连接失败: " + e.message);
    setMcpStatus(false);
  }
}

function doDisconnect() {
  mcpSessionId = null;
  tools = [];
  setMcpStatus(false); setLlmStatus(false);
  document.getElementById("input").disabled = true;
  document.getElementById("send-btn").disabled = true;
  document.getElementById("connect-btn").disabled = false;
  document.getElementById("disconnect-btn").disabled = true;
  addMsg("system", "已断开连接");
}

function setMcpStatus(on) {
  document.getElementById("dot-mcp").className = "dot " + (on?"on":"off");
  document.getElementById("st-mcp").textContent = on ? "已连接 ("+mcpSessionId?.slice(0,12)+"...)" : "未连接";
}
function setLlmStatus(on, model) {
  document.getElementById("dot-llm").className = "dot " + (on?"on":"off");
  document.getElementById("st-llm").textContent = on ? model : "未配置";
}

async function doSend() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = ""; input.style.height = "auto";
  addMsg("user", text);
  busy = true; document.getElementById("send-btn").disabled = true;

  if (text.startsWith("/")) {
    await handleSlash(text);
    busy = false; document.getElementById("send-btn").disabled = false;
    return;
  }

  const key = document.getElementById("llm-key").value;
  if (!key) { addMsg("system", "⚠️ 请先配置 API Key"); busy = false; document.getElementById("send-btn").disabled = false; return; }

  messages.push({role:"user",content:text});
  const allTools = tools.map(t => ({type:"function",function:{name:t.name,description:t.description||"",parameters:t.inputSchema||{type:"object"}}}));

  try {
    await llmChat(messages, allTools, key);
  } catch(e) {
    addMsg("system", "❌ " + e.message);
  }
  busy = false; document.getElementById("send-btn").disabled = false;
}

async function llmChat(msgs, allTools, key, depth) {
  depth = depth || 0;
  if (depth > 10) { addMsg("system", "⚠️ 达到最大工具调用深度"); return; }

  const endpoint = document.getElementById("llm-endpoint").value;
  const model = document.getElementById("llm-model").value;
  const userId = Number(document.getElementById("user-id").value);
  const role = document.getElementById("user-role").value;

  const systemMsg = {role:"system", content:"你是一个 AI 助手，嵌入在用户的软件系统中。当前用户ID: "+userId+"，角色: "+role+"。你可以使用工具完成用户请求。请用中文回复。在调用工具时，务必在 _context 参数中传递 {userId: "+userId+", role: \\""+role+"\\"}。"};
  const body = {model, messages:[systemMsg, ...msgs], tools: allTools.length ? allTools : undefined, stream: true};
  const resp = await fetch(endpoint + "/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json", Authorization:"Bearer "+key},
    body: JSON.stringify(body)
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error(resp.status + ": " + t.slice(0,200)); }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let assistantText = "", toolCalls = [], buffer = "";
  currentEl = null;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split("\\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          assistantText += delta.content;
          if (!currentEl) currentEl = addMsg("assistant", "");
          currentEl.textContent += delta.content;
          document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) toolCalls.push({id:"",type:"function",function:{name:"",arguments:""}});
              const slot = toolCalls[tc.index];
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.function.name += tc.function.name;
              if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
            }
          }
        }
      } catch(e) {}
    }
  }

  if (assistantText) {
    msgs.push({role:"assistant", content:assistantText});
    currentEl = null;
  }

  if (toolCalls.length > 0) {
    msgs.push({role:"assistant", content:null, tool_calls:toolCalls});
    for (const tc of toolCalls) {
      const fnName = tc.function.name;
      let fnArgs = {};
      try { fnArgs = JSON.parse(tc.function.arguments); } catch(e) {}
      const argsStr = JSON.stringify(fnArgs).slice(0,150);
      const toolEl = addMsg("system", "🔧 " + fnName + "\\n├─ 参数: " + argsStr);
      const t0 = Date.now();
      try {
        fnArgs._context = {userId: Number(document.getElementById("user-id").value), role: document.getElementById("user-role").value};
        const result = await mcpCallTool(fnName, fnArgs);
        const dur = Date.now() - t0;
        const resStr = result?.success !== undefined ? (result.success ? "✅ 成功" : "❌ " + (result.error?.message||"失败")) : JSON.stringify(result).slice(0,100);
        toolEl.textContent += "\\n├─ 耗时: " + dur + "ms\\n└─ 结果: " + resStr;
        msgs.push({role:"tool", tool_call_id:tc.id, content:JSON.stringify(result)});
      } catch(e) {
        const dur = Date.now() - t0;
        toolEl.textContent += "\\n├─ 耗时: " + dur + "ms\\n└─ 错误: " + e.message;
        msgs.push({role:"tool", tool_call_id:tc.id, content:JSON.stringify({success:false,error:{message:e.message}})});
      }
    }
    await llmChat(msgs, allTools, key, depth + 1);
  }
}

async function handleSlash(text) {
  const parts = text.trim().split(/\\s+/);
  const cmd = parts[0].toLowerCase();
  if (cmd === "/clear") { clearChat(); addMsg("system", "对话已清空"); messages = []; return; }
  if (cmd === "/tools") { addMsg("system", "可用工具 ("+tools.length+"):\\n"+tools.map(t=>"  • "+t.name+" — "+(t.description||"")).join("\\n")); return; }
  if (cmd === "/save") {
    const title = parts.slice(1).join(" ") || "Demo会话";
    const r = await mcpCallTool("session_save", {title, messages: messages.map(m=>({role:m.role==="tool"?"tool_result":m.role, content:typeof m.content==="string"?m.content:JSON.stringify(m.content||"")}))});
    addMsg("system", r?.success ? "✅ 会话已保存 (ID: "+r.data?.sessionId+")" : "保存失败"); return;
  }
  if (cmd === "/history") {
    const r = await mcpCallTool("session_list", {});
    if (r?.success && r.data?.items?.length) {
      addMsg("system", "历史会话:\\n" + r.data.items.map((s,i) => (i+1)+". "+s.title+" ("+s.messageCount+"条消息) #"+s.id).join("\\n"));
    } else { addMsg("system", "暂无历史会话"); } return;
  }
  if (cmd === "/help") {
    addMsg("system", "可用命令:\\n  /clear — 清空对话\\n  /tools — 查看工具列表\\n  /save [标题] — 保存当前会话\\n  /history — 查看历史会话\\n  /help — 帮助"); return;
  }
  addMsg("system", "未知命令: "+cmd+"，输入 /help 查看可用命令");
}

function addMsg(role, content) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = content;
  document.getElementById("chat").appendChild(el);
  document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
  return el;
}
function clearChat() { document.getElementById("chat").innerHTML = ""; }

document.getElementById("input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
});
document.getElementById("input").addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});
</script>
</body>
</html>`;
}

