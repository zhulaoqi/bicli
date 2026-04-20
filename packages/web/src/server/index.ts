import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { BiCLIEngine, McpConnectionPool, isSlashCommand } from "@bicli/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WebServerOptions {
  port?: number;
  host?: string;
  skillsDir?: string;
  mcpServerPath?: string;
}

export async function startWebServer(options: WebServerOptions = {}) {
  const port = options.port || 3210;
  const host = options.host || "127.0.0.1";
  const token = randomBytes(16).toString("hex");

  const skillsDir = options.skillsDir || resolve(__dirname, "../../../../skills/definitions");
  const mcpServerPath = options.mcpServerPath || resolve(__dirname, "../../../../mcp-server/src/index.ts");

  const pool = new McpConnectionPool("npx", ["tsx", mcpServerPath]);
  await pool.initialize();
  console.log("  MCP connection pool initialized (shared across sessions)");

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  app.get("/", (req, res) => {
    const reqHost = req.headers.host || `${host}:${port}`;
    const wsProtocol = req.protocol === "https" ? "wss" : "ws";
    res.type("html").send(buildClientHTML(reqHost, wsProtocol, token));
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "2.0.0", connections: pool.getRefCount() });
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (url.searchParams.get("token") !== token) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const mcpConn = pool.acquire();
    const engine = new BiCLIEngine({
      platform: "web",
      skillsDir,
      mcpServerPath,
      mcpConnection: mcpConn,
    });

    try {
      await engine.initialize();
      const status = engine.getStatus();
      sendJSON(ws, { type: "connected", status });
    } catch (err) {
      pool.release();
      sendJSON(ws, { type: "error", message: `Engine init failed: ${err instanceof Error ? err.message : err}` });
      return;
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "chat") {
          const input = msg.content as string;
          if (isSlashCommand(input)) {
            const result = await engine.executeSlashCommand(input);
            sendJSON(ws, { type: "slash_result", result });
            return;
          }

          for await (const event of engine.chat(input)) {
            sendJSON(ws, { type: "chat_event", event });
          }
        }

        if (msg.type === "get_status") {
          sendJSON(ws, { type: "status", status: engine.getStatus() });
        }
      } catch (err) {
        sendJSON(ws, { type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    });

    ws.on("close", async () => {
      await engine.dispose();
      pool.release();
    });
  });

  const shutdown = async () => {
    console.log("\n  Shutting down...");
    wss.close();
    server.close();
    await pool.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(port, host, () => {
    console.log(`\n  🌐 BiCLI Web GUI`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Local:   http://${host}:${port}`);
    console.log(`  Token:   ${token.slice(0, 8)}...`);
    console.log(`  ────────────────────────────────`);
    console.log(`  按 Ctrl+C 停止\n`);
  });

  return { server, port, host, token, pool };
}

function sendJSON(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function buildClientHTML(reqHost: string, wsProtocol: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BiCLI Web</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --yellow: #d29922; }
  body { font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
  #status-bar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 8px 16px; display: flex; gap: 24px; align-items: center; font-size: 13px; }
  .status-item { display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.on { background: var(--green); } .dot.off { background: var(--red); }
  #chat { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; font-size: 14px; }
  .msg.user { align-self: flex-end; background: #1f6feb; color: white; }
  .msg.assistant { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); }
  .msg.system { align-self: center; background: transparent; color: var(--dim); font-size: 12px; border: 1px solid var(--border); padding: 6px 12px; }
  .msg .tool-tag { display: inline-block; background: #30363d; color: var(--yellow); padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-bottom: 4px; }
  #input-area { border-top: 1px solid var(--border); padding: 12px 16px; display: flex; gap: 8px; background: var(--surface); }
  #input { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-family: inherit; font-size: 14px; outline: none; resize: none; }
  #input:focus { border-color: var(--accent); }
  #send { background: var(--accent); color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500; }
  #send:hover { opacity: 0.9; } #send:disabled { opacity: 0.4; cursor: not-allowed; }
  #shortcuts { padding: 4px 16px; background: var(--surface); font-size: 11px; color: var(--dim); display: flex; gap: 16px; }
</style>
</head>
<body>
<div id="status-bar">
  <span style="font-weight:600;color:var(--accent)">bicli 2.0</span>
  <span class="status-item"><span class="dot" id="conn-dot"></span><span id="conn-text">连接中...</span></span>
  <span class="status-item">Model: <span id="model-text" style="color:var(--accent)">-</span></span>
  <span class="status-item">Role: <span id="role-text" style="color:#d2a8ff">-</span></span>
  <span class="status-item">Tools: <span id="tools-text">-</span></span>
</div>
<div id="chat"></div>
<div id="shortcuts">[Enter] Send &nbsp; [Shift+Enter] Newline &nbsp; [/help] Commands &nbsp; [/skill] Skills</div>
<div id="input-area">
  <textarea id="input" rows="1" placeholder="输入消息，或用 / 开头执行命令..." autofocus></textarea>
  <button id="send">发送</button>
</div>
<script>
const WS_URL = "${wsProtocol}://${reqHost}/ws?token=${token}";
const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
let ws, busy = false, currentAssistantEl = null, history = [], historyIdx = -1;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {};
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "connected") {
      setStatus(true, msg.status);
      addMsg("system", "已连接到 BiCLI。输入 /help 查看可用命令。");
    }
    if (msg.type === "chat_event") handleChatEvent(msg.event);
    if (msg.type === "slash_result") {
      addMsg("system", formatSlashResult(msg.result));
      if (msg.result.type === "model_switched") document.getElementById("model-text").textContent = msg.result.to.name;
      busy = false; sendBtn.disabled = false;
    }
    if (msg.type === "error") { addMsg("system", "错误: " + msg.message); busy = false; sendBtn.disabled = false; }
  };
  ws.onclose = () => { setStatus(false); setTimeout(connect, 3000); };
}

function setStatus(on, status) {
  document.getElementById("conn-dot").className = "dot " + (on ? "on" : "off");
  document.getElementById("conn-text").textContent = on ? "已连接" : "已断开";
  if (status) {
    document.getElementById("model-text").textContent = status.model || "-";
    document.getElementById("role-text").textContent = status.role || "-";
    document.getElementById("tools-text").textContent = status.toolCount || "-";
  }
}

function addMsg(role, content, toolTag) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  if (toolTag) el.innerHTML = '<span class="tool-tag">' + toolTag + '</span><br>';
  el.textContent ? (el.textContent += content) : (el.appendChild(document.createTextNode(content)));
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function handleChatEvent(ev) {
  switch(ev.type) {
    case "text_delta":
      if (!currentAssistantEl) currentAssistantEl = addMsg("assistant", "");
      currentAssistantEl.textContent += (ev.content || "");
      chat.scrollTop = chat.scrollHeight;
      break;
    case "tool_call_start": {
      const argsStr = ev.args ? JSON.stringify(ev.args).slice(0,120) : "";
      const toolEl = addMsg("system", "🔧 " + ev.toolName + "\\n├─ 参数: " + (argsStr || "(无)"));
      toolEl.dataset.tool = ev.toolName;
      break;
    }
    case "tool_call_end": {
      const els = chat.querySelectorAll('.msg.system[data-tool="'+ev.toolName+'"]');
      const lastEl = els[els.length-1];
      if (lastEl) {
        const dur = ev.duration || 0;
        const resStr = typeof ev.result === "string" ? ev.result.slice(0,80) : JSON.stringify(ev.result||"").slice(0,80);
        lastEl.textContent += "\\n├─ 耗时: "+dur+"ms\\n└─ 结果: "+resStr;
      }
      break;
    }
    case "done":
      currentAssistantEl = null;
      busy = false; sendBtn.disabled = false;
      break;
    case "error":
      addMsg("system", "错误: " + ev.message);
      currentAssistantEl = null;
      busy = false; sendBtn.disabled = false;
      break;
  }
}

function formatSlashResult(r) {
  switch(r.type) {
    case "model_list": return r.models.map((m,i) => (i+1)+". "+m.name+" ("+m.provider+")"+(m.id===r.current?" ← 当前":"")).join("\\n");
    case "model_switched": return "模型已切换: "+r.from+" → "+r.to.name;
    case "role_info": return "角色: "+r.role+"\\n权限: "+r.permissions.join(", ")+"\\n工具: "+r.availableTools.join(", ");
    case "tools_list": return r.tools.map(t=>"• "+t.name+": "+t.description).join("\\n");
    case "skill_list": return r.skills.length===0?"暂无 Skill":r.skills.map((s,i)=>(i+1)+". "+s.title+" ("+s.name+")\\n   "+s.description+"\\n   触发词: "+s.triggers.join(", ")).join("\\n\\n");
    case "skill_created": return "Skill \\""+r.name+"\\" 已创建: "+r.path;
    case "user_list": return "可用用户:\\n"+r.users.map(u=>u.id+". "+u.username+" ["+u.role+"] "+u.status+(u.id===r.currentUserId?" ← 当前":"")).join("\\n")+"\\n\\n输入 /user <id或用户名> 切换身份";
    case "user_switched": return "身份已切换: "+r.from.username+"("+r.from.role+") → "+r.to.username+"("+r.to.role+")\\n权限: "+r.permissions.join(", ")+"\\n对话历史已清空";
    case "session_list": return r.sessions.length===0?"暂无历史会话":r.sessions.map((s,i)=>(i+1)+". "+s.title+" ("+s.messageCount+"条消息)"+(s.id===r.currentId?" ← 当前":"")).join("\\n");
    case "session_saved": return "✅ 会话已保存: "+r.title;
    case "session_title_set": return "✅ 会话标题: "+r.title;
    case "cleared": return "对话已清空";
    case "help": return r.commands.map(c=>c.command+" — "+c.description).join("\\n");
    case "error": return "错误: "+r.message;
    default: return JSON.stringify(r);
  }
}

function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  history.unshift(text); historyIdx = -1;
  addMsg("user", text);
  ws.send(JSON.stringify({ type: "chat", content: text }));
  input.value = ""; input.style.height = "auto";
  busy = true; sendBtn.disabled = true;
}

sendBtn.onclick = send;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  if (e.key === "ArrowUp" && !input.value) { e.preventDefault(); if (history.length) { historyIdx = Math.min(historyIdx+1, history.length-1); input.value = history[historyIdx]; } }
  if (e.key === "ArrowDown" && historyIdx >= 0) { e.preventDefault(); historyIdx--; input.value = historyIdx < 0 ? "" : history[historyIdx]; }
});
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });

connect();
</script>
</body>
</html>`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("web/src/server/index.ts")) {
  startWebServer();
}
