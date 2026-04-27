#!/bin/bash
set -e

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 配置由代码默认值或部署平台环境变量提供；start.sh 只负责启动进程。
log "Starting BiCLI MCP HTTP server ..."
log "  Profile     : ${PROFILE:-default}"
log "  Port        : ${MCP_HTTP_PORT:-3211}"
log "  DataEye API : ${DATAEYE_API_URL:-<not set>}"
log "  Datart API  : ${DATART_API_URL:-<not set>}"

cd /app
exec node packages/mcp-server/dist/http-server.js
