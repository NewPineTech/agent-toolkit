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
COPY packages/cli/bin/ packages/cli/bin/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY packages/core/ packages/core/
COPY packages/widget/ packages/widget/
COPY packages/server/ packages/server/
COPY packages/cli/ packages/cli/
RUN pnpm --filter @agent-toolkit/types run build \
 && pnpm --filter @agent-toolkit/core run build \
 && pnpm --filter @agent-toolkit/widget run build \
 && pnpm --filter @agent-toolkit/server run build \
 && pnpm --filter @agent-toolkit/cli run build

FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS production
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/server/dist ./packages/server/dist
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
 && ln -s /app/packages/cli/bin/agent-toolkit.mjs /usr/local/bin/atk

USER app
ENV WIDGET_STANDALONE_BUNDLE_PATH=/app/packages/server/dist/widget/standalone.global.js
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "packages/server/dist/server.js"]
