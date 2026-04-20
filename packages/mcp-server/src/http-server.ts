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

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3211", 10);
const HOST = process.env.MCP_HTTP_HOST || "0.0.0.0";

const transports: Record<string, StreamableHTTPServerTransport> = {};

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

  app.use(cors({
    origin: process.env.MCP_CORS_ORIGIN || "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
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
    console.log(`  Health:    http://${HOST}:${PORT}/health`);
    console.log(`  CORS:      ${process.env.MCP_CORS_ORIGIN || "*"}`);
    console.log(`  ─────────────────────────\n`);
  });
}

main().catch((err) => {
  console.error("Failed to start MCP HTTP Server:", err);
  process.exit(1);
});

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

