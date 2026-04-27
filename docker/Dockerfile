# BiCLI MCP Server runtime image
# 编译由 docker/build.sh 完成；Dockerfile 只复制 dist 产物并安装生产依赖。
FROM node:22-alpine

RUN apk add --no-cache \
    tzdata \
    curl \
    bash \
    netcat-openbsd \
    mysql-client

ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
ENV APP_HOME=/app
ENV PERMISSION_MODE=dataeye
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=3211
ENV MCP_BASE_PATH=/bicli-mcp

WORKDIR $APP_HOME

RUN npm install -g pnpm@10

# 复制 workspace 描述文件（pnpm 解析 workspace 协议需要）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .env.envtest ./

# 复制各包的 package.json + build.sh 已生成的 dist 产物
COPY packages/mcp-server/package.json  ./packages/mcp-server/
COPY packages/mcp-server/dist          ./packages/mcp-server/dist/
COPY packages/core/package.json        ./packages/core/
COPY packages/core/dist                ./packages/core/dist/
COPY packages/skills/package.json      ./packages/skills/
COPY packages/skills/dist              ./packages/skills/dist/

# 仅安装生产依赖（workspace 内部包通过 symlink 解析，无需网络）
RUN pnpm install --prod --frozen-lockfile

# 复制启动脚本
COPY docker/start.sh $APP_HOME/start.sh
RUN chmod +x $APP_HOME/start.sh

EXPOSE 3211

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:3211/health || exit 1

CMD ["/app/start.sh"]
