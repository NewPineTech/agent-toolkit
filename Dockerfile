FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/core/package.json packages/core/
COPY packages/widget/package.json packages/widget/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/agentic/package.json packages/agentic/
COPY packages/cli/bin/ packages/cli/bin/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY packages/core/ packages/core/
COPY packages/widget/ packages/widget/
COPY packages/server/ packages/server/
COPY packages/cli/ packages/cli/
COPY packages/agentic/ packages/agentic/
RUN pnpm --filter @agent-toolkit/types run build \
 && pnpm --filter @agent-toolkit/core run build \
 && pnpm --filter @agent-toolkit/widget run build \
 && pnpm --filter @agent-toolkit/agentic run build \
 && pnpm --filter @agent-toolkit/server run build \
 && pnpm --filter @agent-toolkit/cli run build

FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --prod --force

FROM node:22-alpine AS runtime-base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate \
 && addgroup -g 1001 -S app && adduser -S app -u 1001
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=prod-deps /app/packages/agentic/node_modules ./packages/agentic/node_modules
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/agentic/dist ./packages/agentic/dist
COPY --from=build /app/packages/agentic/package.json ./packages/agentic/
COPY --from=build /app/packages/agentic/langgraph.json ./packages/agentic/
COPY --from=build /app/packages/agentic/langgraph.docker.json ./packages/agentic/
COPY --from=build /app/packages/cli/dist ./packages/cli/dist
COPY --from=build /app/packages/cli/bin ./packages/cli/bin
COPY --from=build /app/packages/cli/package.json ./packages/cli/
COPY --from=build /app/packages/widget/dist/standalone.global.js ./packages/server/dist/widget/standalone.global.js
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
 && ln -s /app/packages/cli/bin/agent-toolkit.mjs /usr/local/bin/agent-toolkit \
 && ln -s /app/packages/cli/bin/agent-toolkit.mjs /usr/local/bin/atk \
 && mkdir -p /app/packages/agentic/.langgraph_api \
 && printf ".langgraph_api\n" > /app/packages/agentic/.gitignore \
 && chown app:app /app/packages/agentic/.gitignore /app/packages/agentic/.langgraph_api

USER app
ENV WIDGET_STANDALONE_BUNDLE_PATH=/app/packages/server/dist/widget/standalone.global.js

FROM runtime-base AS server-runtime
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "packages/server/dist/server.js"]

FROM runtime-base AS agentic-runtime
EXPOSE 2024
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2024/health || exit 1
CMD ["node", "packages/agentic/dist/server.js"]

FROM runtime-base AS agentic-studio
COPY --from=build /app/packages/agentic/src ./packages/agentic/src
COPY --from=build /app/packages/agentic/tsconfig.json ./packages/agentic/
EXPOSE 2025
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2025/ok || exit 1
CMD ["pnpm", "--dir", "/app/packages/agentic", "exec", "langgraphjs", "dev", "--host", "0.0.0.0", "--port", "2025", "--no-browser", "--config", "langgraph.docker.json"]

FROM server-runtime AS production
