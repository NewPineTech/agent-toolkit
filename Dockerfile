FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY packages/server/ packages/server/
RUN pnpm --filter @agent-toolkit/types run build \
 && pnpm --filter @agent-toolkit/server run build

FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS production
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "packages/server/dist/server.js"]
