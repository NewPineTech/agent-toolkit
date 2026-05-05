# Production Deployment

The production stack uses `docker-compose.prod.yml` — a hardened setup with resource limits, network isolation, restart policies, and health checks.

## 1. Configure secrets

```bash
cp .env.prod.example .env.prod
```

Fill in the required values:

| Variable            | How to generate                |
| ------------------- | ------------------------------ |
| `JWT_SECRET`        | `openssl rand -hex 32`         |
| `ENCRYPTION_KEY`    | `openssl rand -hex 32`         |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24`      |

## 2. Build the image

```bash
./scripts/deploy.sh build
```

Or manually:

```bash
docker compose -f docker-compose.prod.yml build server
```

## 3. Run database migrations

```bash
./scripts/deploy.sh migrate
```

This runs Drizzle migrations inside a one-off container (using the `migrate` profile) and exits.

## 4. Start the stack

```bash
./scripts/deploy.sh up
```

Services start in dependency order: PostgreSQL → Redis → Server. The server only starts after both dependencies pass their health checks.

## 5. Verify

```bash
./scripts/deploy.sh status

# Check readiness (includes DB + Redis connectivity)
curl http://localhost:3000/health/ready
```

## Deploy script reference

| Command                      | Description                         |
| ---------------------------- | ----------------------------------- |
| `./scripts/deploy.sh build`   | Build production image (no cache)   |
| `./scripts/deploy.sh up`      | Start all services (detached)       |
| `./scripts/deploy.sh down`    | Stop and remove containers          |
| `./scripts/deploy.sh migrate` | Run pending DB migrations           |
| `./scripts/deploy.sh restart` | Rebuild and restart the server only |
| `./scripts/deploy.sh logs`    | Tail server logs (or pass service)  |
| `./scripts/deploy.sh status`  | Show containers and health status   |
| `./scripts/deploy.sh seed`    | Seed a dev workspace                |

## Production architecture

```
                ┌─────────────────────────────────────────┐
                │           "web" network                  │
                │                                         │
   :3000 ◄─────┤  server (Node.js, non-root)             │
                │    │         │                          │
                └────┼─────────┼──────────────────────────┘
                     │         │
                ┌────┼─────────┼──────────────────────────┐
                │    ▼         ▼    "internal" network     │
                │  postgres   redis                        │
                │  (no published ports)                    │
                └─────────────────────────────────────────┘
```

- **Network isolation** — PostgreSQL and Redis are only reachable from the server; no ports are published to the host.
- **Resource limits** — Each service has memory/CPU caps to prevent cascading OOM.
- **Restart policy** — `unless-stopped` with backoff (max 5 attempts in 60s window).
- **Log rotation** — Server logs capped at 5 × 10 MB files.
- **Health checks** — Production uses `/health/ready` (verifies DB + Redis) rather than just `/health/live`.

## Updating in production

```bash
git pull
./scripts/deploy.sh build
./scripts/deploy.sh migrate   # if there are new migrations
./scripts/deploy.sh restart
```

## Docker Production Image

The Dockerfile uses a multi-stage build: build stage compiles TypeScript, production stage runs as a non-root user with a health check.

```bash
docker build -t agent-toolkit .
```

## Database Migrations

The server uses [Drizzle ORM](https://orm.drizzle.team/) for schema management. Migrations live in `packages/server/drizzle/`.

```bash
# Generate a new migration after editing packages/server/src/db/schema.ts
cd packages/server && npx drizzle-kit generate

# Apply pending migrations
cd packages/server && npx drizzle-kit migrate
```

## Creating a Workspace via CLI

```bash
pnpm db:create-workspace -- \
  --id ws_acme_001 \
  --agent-id 550e8400-e29b-41d4-a716-446655440000 \
  --api-key ragflow-xxxxx \
  --base-url https://ragflow.example.com \
  --domains "https://acme.com,https://app.acme.com" \
  --auth-mode anonymous
```

The script encrypts the API key automatically and upserts the workspace (safe to re-run). Run with `--help` for all options.

## Environment Variables

Required variables:

| Variable         | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string                                |
| `REDIS_URL`      | Redis connection string                                     |
| `JWT_SECRET`     | HMAC secret for session tokens (min 32 chars)               |
| `ENCRYPTION_KEY` | AES-256 key for encrypting provider API keys (min 32 chars) |

Optional variables (with defaults):

| Variable              | Default       | Description                                   |
| --------------------- | ------------- | --------------------------------------------- |
| `PORT`                | `3000`        | Server port                                   |
| `HOST`                | `0.0.0.0`     | Bind address                                  |
| `LOG_LEVEL`           | `info`        | `fatal` `error` `warn` `info` `debug` `trace` |
| `SESSION_TTL_MINUTES` | `30`          | Widget session lifetime                       |
| `CORS_MAX_AGE`        | `86400`       | CORS preflight cache (seconds)                |
| `SHUTDOWN_TIMEOUT_MS` | `30000`       | Graceful shutdown timeout                     |
| `NODE_ENV`            | `development` | `development` `production` `test`             |
