#!/bin/bash
set -e

export PROFILE="${PROFILE:-envtest}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

load_apollo_env() {
  export APOLLO_SERVICE="${APOLLO_SERVICE:-${APOLLO_META:-}}"

  if [ -z "${APOLLO_SERVICE:-}" ]; then
    log "Apollo config disabled: APOLLO_META/APOLLO_SERVICE is not set"
    return
  fi

  export APOLLO_APP_ID="${APOLLO_APP_ID:-bicli}"
  export APOLLO_CLUSTER="${APOLLO_CLUSTER:-default}"
  export APOLLO_NAMESPACE="${APOLLO_NAMESPACE:-application}"
  export BICLI_RUNTIME_ENV_FILE="${BICLI_RUNTIME_ENV_FILE:-/tmp/bicli-apollo.env}"

  log "Loading Apollo config: service=${APOLLO_SERVICE}, appId=${APOLLO_APP_ID}, cluster=${APOLLO_CLUSTER}, namespace=${APOLLO_NAMESPACE}"

  node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";

const service = (process.env.APOLLO_SERVICE || "").replace(/\/+$/, "");
const appId = process.env.APOLLO_APP_ID || "bicli";
const cluster = process.env.APOLLO_CLUSTER || "default";
const namespace = process.env.APOLLO_NAMESPACE || "application";
const output = process.env.BICLI_RUNTIME_ENV_FILE || "/tmp/bicli-apollo.env";

function enc(v) {
  return encodeURIComponent(v).replace(/%2F/g, "/");
}

function dotenvValue(value) {
  const s = String(value ?? "");
  return /^[A-Za-z0-9_./:@-]*$/.test(s) ? s : JSON.stringify(s);
}

const url = `${service}/configs/${enc(appId)}/${enc(cluster)}/${enc(namespace)}`;
const resp = await fetch(url, { headers: { Accept: "application/json" } });
if (!resp.ok) {
  const text = await resp.text().catch(() => "");
  throw new Error(`Apollo ${resp.status}: ${text.slice(0, 200)}`);
}

const json = await resp.json();
const configs = json.configurations || {};
const lines = Object.entries(configs)
  .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
  .map(([key, value]) => `${key}=${dotenvValue(value)}`);

writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`[Apollo] wrote ${lines.length} keys to ${output}`);
NODE
}

load_apollo_env

# 配置由代码默认值或部署平台环境变量提供；start.sh 只负责启动进程。
log "Starting BiCLI MCP HTTP server ..."
log "  Profile     : ${PROFILE:-default}"
log "  Port        : ${MCP_HTTP_PORT:-3211}"
log "  DataEye API : ${DATAEYE_API_URL:-<not set>}"
log "  Datart API  : ${DATART_API_URL:-<not set>}"

cd /app
exec node packages/mcp-server/dist/http-server.js
