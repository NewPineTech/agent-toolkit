# Production Deployment

The production stack uses `docker-compose.prod.yml` — a hardened setup with resource limits, network isolation, restart policies, and health checks.

---

## Quick Install

The quick installer clones the repo, generates secrets, builds Docker images, runs migrations, and optionally creates your first workspace — all in one command.

### Prerequisites

| Tool             | Min version | Install                                                             |
| ---------------- | ----------- | ------------------------------------------------------------------- |
| `git`            | any         | https://git-scm.com                                                 |
| `node`           | 22          | https://nodejs.org                                                  |
| `pnpm`           | 9           | `npm install -g pnpm`                                               |
| `docker`         | any         | https://docs.docker.com/get-docker                                  |
| `docker compose` | v2          | bundled with Docker Desktop; or `apt install docker-compose-plugin` |

### Run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/NewPineTech/agent-toolkit/main/install.sh | bash
```

The installer will prompt for any configuration it needs. You can also pre-set values as environment variables to skip the prompts:

| Variable                 | Default         | What it controls                                        |
| ------------------------ | --------------- | ------------------------------------------------------- |
| `AGENT_TOOLKIT_DIR`      | `agent-toolkit` | Directory to clone the repo into                        |
| `WIDGET_API_URL`         | empty           | Client-facing server URL baked into the Storybook build |
| `WORKSPACE_AUTH_MODE`    | `anonymous`     | Workspace auth mode used by quick setup                 |
| `WORKSPACE_MAX_REQUESTS` | `30`            | Workspace rate-limit max requests                       |
| `WORKSPACE_WINDOW_MS`    | `60000`         | Workspace rate-limit window in ms                       |

```bash
# Example: install into a custom dir, point Storybook at a remote API
AGENT_TOOLKIT_DIR=my-project \
WIDGET_API_URL=https://api.yourprod.com \
  curl -fsSL https://raw.githubusercontent.com/NewPineTech/agent-toolkit/main/install.sh | bash
```

### What the installer does

The installer runs the following steps automatically. Understanding them helps if anything goes wrong.

**1. Prerequisite check**

Verifies `git`, `node ≥ 22`, `pnpm ≥ 9`, `docker`, and `docker compose v2` are all present and meet the minimum version requirements. Exits immediately with an actionable error if any check fails.

**2. Clone or update the repository**

- If run from inside an existing local clone, uses it as-is.
- If the target directory already exists (e.g. from a previous install), runs `git pull --ff-only` to update it.
- Otherwise, clones from GitHub into `./agent-toolkit` (or `$AGENT_TOOLKIT_DIR` if set).

**3. Install dependencies**

Runs `pnpm install --frozen-lockfile` to install all workspace packages.

**4. Prompt for server port and Widget API URL**

Asks for the host port to expose the API server (default: `3000`). This becomes `PORT` in `.env.prod`.

Then asks for the Widget API URL used by client-side widget builds. This should be the server URL browsers will call, for example `https://api.yourprod.com`. You can leave it empty when you want the widget to use relative URLs. This value is baked into the Storybook static build at compile time — changing it requires rebuilding the image.

**5. Generate `.env.prod`**

If `.env.prod` does not exist, it is created from `.env.prod.example` with all three secrets generated automatically:

| Variable            | Generated with         |
| ------------------- | ---------------------- |
| `JWT_SECRET`        | `openssl rand -hex 32` |
| `ENCRYPTION_KEY`    | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |

If `.env.prod` already exists, only `PORT` is updated — existing secrets are preserved.

**6. Build runtime and Storybook images**

Runs `docker compose build server langgraph langstudio` using the production
multi-stage `Dockerfile`, then `docker compose build storybook` passing
`WIDGET_API_URL` as a Docker build arg. The runtime images build the workspace
packages in dependency order: `types`, `core`, `widget`, `agentic`, `server`,
then `cli`.

**7. Start PostgreSQL and Redis**

Starts `postgres` and `redis` containers in detached mode and waits (up to 30 s) for PostgreSQL to pass its health check before proceeding.

**8. Run database migrations**

Runs Drizzle migrations inside a one-off container. If the migration fails, the installer prints a warning and continues — you can re-run migrations manually afterwards:

```bash
./scripts/deploy.sh migrate
```

> **Note:** Migrations also run automatically via `docker-entrypoint.sh` every time the server container starts. The manual `migrate` command is useful when the server container is not yet running (e.g. first-time setup, or when applying migrations before a rolling restart).

**9. Workspace setup (interactive, optional)**

The installer prompts: `Create a workspace now? (Y/n)`.

A workspace binds a widget `workspaceId` to a RAGFlow agent. If you answer **Y**, quick setup prompts only for the required values:

| Prompt             | Example                                | Required |
| ------------------ | -------------------------------------- | -------- |
| Workspace ID       | `ws_my_project`                        | yes      |
| RAGFlow agent UUID | `550e8400-e29b-41d4-a716-446655440000` | yes      |
| RAGFlow API key    | `ragflow-xxxxx`                        | yes      |
| RAGFlow server URL | `https://ragflow.example.com`          | yes      |

Quick setup stores `*` as the allowed domains value so the widget can be tested from any origin. It also uses `anonymous` auth, `30` requests per `60000` ms, and encrypts the RAGFlow API key at rest before storing it. The operation is idempotent (safe to re-run with the same workspace ID to update config).

If you skip this step, create a workspace later with:

```bash
agent-toolkit workspace create \
  --id ws_my_project \
  --agent-id 550e8400-e29b-41d4-a716-446655440000 \
  --api-key ragflow-xxxxx \
  --base-url https://ragflow.example.com \
  --domains "*" \
  --auth-mode anonymous
```

**10. Start the full stack**

Runs `docker compose up -d` to bring up all services. At this point the server,
postgres, redis, Agentic LangGraph runtime, LangGraph Studio dev API, and
Storybook container are running.

### Post-install verification

```bash
# Check all containers are healthy
./scripts/deploy.sh status

# Confirm the server is ready (checks DB + Redis connectivity)
curl http://localhost:3000/health/ready

# Confirm Storybook is serving
curl -I http://localhost:6006/
```

### Managing the installation

After installing, use the deploy script from the project directory:

```bash
cd agent-toolkit   # (or your $AGENT_TOOLKIT_DIR)

./scripts/deploy.sh status    # Show containers and health
./scripts/deploy.sh logs      # Tail server logs
./scripts/deploy.sh restart   # Rebuild and restart the server
./scripts/deploy.sh down      # Stop everything
```

### Troubleshooting

| Symptom                            | Fix                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite check fails           | Install the missing tool at the version shown and re-run                                                                            |
| `git pull` fails during re-install | `cd agent-toolkit && git status` to inspect local changes                                                                           |
| Migration warning at install time  | Run `./scripts/deploy.sh migrate` after the stack is up                                                                             |
| Workspace creation fails           | Run `docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace create --help` and create it manually |
| Server container exits immediately | Run `./scripts/deploy.sh logs` to inspect startup errors — usually a missing or malformed `.env.prod` value                         |
| Port already in use                | Re-run the installer and choose a different port, or update `PORT` in `.env.prod` and run `./scripts/deploy.sh restart`             |

---

## Manual Deployment

The following steps mirror what the quick installer does, for cases where you need more control (CI/CD pipelines, custom infrastructure, air-gapped environments).

### 1. Configure secrets

```bash
cp .env.prod.example .env.prod
```

Fill in the required values:

| Variable            | How to generate        |
| ------------------- | ---------------------- |
| `JWT_SECRET`        | `openssl rand -hex 32` |
| `ENCRYPTION_KEY`    | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |

### 2. Build the images

```bash
./scripts/deploy.sh build
```

Or manually:

```bash
# Build the API server
docker compose -f docker-compose.prod.yml build server

# Build Storybook (WIDGET_API_URL is baked in at build time)
WIDGET_API_URL=https://api.yourprod.com docker compose -f docker-compose.prod.yml build storybook
```

### 3. Run database migrations

```bash
./scripts/deploy.sh migrate
```

This runs Drizzle migrations inside a one-off container and exits. Migrations also run automatically via `docker-entrypoint.sh` each time the server container starts, so this step is mainly needed on first deploy or when applying migrations before starting the server.

### 4. Start the stack

```bash
./scripts/deploy.sh up
```

Services start in dependency order: PostgreSQL → Redis → Server. The server only starts after both dependencies pass their health checks. Storybook starts independently — it has no runtime dependencies on the other services.

### 5. Create a workspace

A workspace is required before the widget can connect. Create one with the Agent Toolkit CLI:

```bash
agent-toolkit workspace create \
  --id ws_acme_001 \
  --agent-id 550e8400-e29b-41d4-a716-446655440000 \
  --api-key ragflow-xxxxx \
  --base-url https://ragflow.example.com \
  --domains "https://acme.com,https://app.acme.com" \
  --auth-mode anonymous
```

Run with `--help` to see all available options. The operation is idempotent — re-running with the same `--id` updates the existing workspace.

### 6. Verify

```bash
./scripts/deploy.sh status

# Check readiness (includes DB + Redis connectivity)
curl http://localhost:3000/health/ready

# Check Storybook is serving
curl -I http://localhost:6006/
```

---

## Deploy script reference

| Command                              | Description                                               |
| ------------------------------------ | --------------------------------------------------------- |
| `./scripts/deploy.sh build`          | Build runtime and Storybook images                        |
| `./scripts/deploy.sh up`             | Start all services (detached)                             |
| `./scripts/deploy.sh down`           | Stop and remove containers                                |
| `./scripts/deploy.sh migrate`        | Run pending DB migrations                                 |
| `./scripts/deploy.sh restart`        | Rebuild and restart server, LangGraph runtime, and Studio |
| `./scripts/deploy.sh logs [service]` | Tail logs (default: `server`)                             |
| `./scripts/deploy.sh status`         | Show containers and health status                         |

---

## Production architecture

```
                ┌──────────────────────────────────────────────┐
                │              "web" network                    │
                │                                              │
   :3000 ◄─────┤  server (Node.js, non-root)                  │
   :6006 ◄─────┤  storybook (nginx, static)                   │
                │    │                                         │
                └────┼─────────────────────────────────────────┘
                     │
                ┌────┼─────────────────────────────────────────┐
                │    ▼              "internal" network          │
                │  postgres   redis                             │
                │  (no published ports)                         │
                └──────────────────────────────────────────────┘
```

- **Network isolation** — PostgreSQL and Redis are only reachable from the server; no ports are published to the host. Storybook is on `web` only — it has no access to `internal` services.
- **Resource limits** — Each service has memory/CPU caps to prevent cascading OOM.
- **Restart policy** — `unless-stopped` with backoff (max 5 attempts in 60 s window).
- **Log rotation** — Server logs capped at 5 × 10 MB files.
- **Health checks** — Production uses `/health/ready` (verifies DB + Redis) rather than just `/health/live`.
- **Auto-migration** — `docker-entrypoint.sh` runs `node dist/db/migrate.js` before starting the server on every container boot, so schema is always in sync after a `restart` or `up`.

---

## Storybook

Storybook is served as a pre-built static site by nginx. The widget API URL is baked in at build time by Vite — there is no runtime configuration.

```bash
# Build with the correct API URL for your environment
WIDGET_API_URL=https://api.yourprod.com docker compose -f docker-compose.prod.yml build storybook

# Start (or restart) just Storybook
docker compose -f docker-compose.prod.yml up -d storybook

# Access at
http://localhost:6006
```

To change the API URL after initial deploy, rebuild the Storybook image and restart the container:

```bash
WIDGET_API_URL=https://api.newprod.com docker compose -f docker-compose.prod.yml up -d --build storybook
```

---

## Updating in production

```bash
git pull
./scripts/deploy.sh build
./scripts/deploy.sh restart   # entrypoint runs migrations automatically on start
```

If you need to apply migrations before restarting (e.g. zero-downtime migration first):

```bash
git pull
./scripts/deploy.sh build
./scripts/deploy.sh migrate
./scripts/deploy.sh restart
```

---

## Docker production image

The Dockerfile uses a multi-stage build: the build stage compiles TypeScript, the production stage runs as a non-root user with a health check baked in. The entrypoint (`docker-entrypoint.sh`) runs database migrations before handing off to the server process.

```bash
docker build -t agent-toolkit .
```

---

## Database migrations

The server uses [Drizzle ORM](https://orm.drizzle.team/) for schema management. Migrations live in `packages/server/drizzle/`.

```bash
# Generate a new migration after editing packages/server/src/db/schema.ts
cd packages/server && npx drizzle-kit generate

# Apply pending migrations on prod
./scripts/deploy.sh migrate
```

---

## Creating a workspace on production

Use the Agent Toolkit CLI from inside the production server container. The image exposes both `agent-toolkit` and the shorter `atk` command, and the container already has `DATABASE_URL` and `ENCRYPTION_KEY` in its environment:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace create \
  --id ws_acme_001 \
  --agent-id 550e8400-e29b-41d4-a716-446655440000 \
  --api-key ragflow-xxxxx \
  --base-url https://ragflow.example.com \
  --domains "https://acme.com,https://app.acme.com" \
  --auth-mode anonymous

# Show all available flags
docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace create --help
```

The API key is encrypted with AES-256 before being stored. Running with the same `--id` updates the existing workspace (upsert).

---

## Environment variables

Required variables (must be set in `.env.prod`):

| Variable            | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `JWT_SECRET`        | HMAC secret for session tokens (min 32 chars)                          |
| `ENCRYPTION_KEY`    | AES-256 key for encrypting provider API keys (64-character hex string) |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL user                                       |

`DATABASE_URL` and `REDIS_URL` are injected by `docker-compose.prod.yml` for the
server container. Set them directly only when running the server outside the
compose stack.

Optional variables (with defaults):

| Variable                        | Default                 | Description                                                              |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `PORT`                          | `3000`                  | Host port exposed by the server container                                |
| `HOST`                          | `0.0.0.0`               | Bind address                                                             |
| `POSTGRES_DB`                   | `agent_toolkit`         | PostgreSQL database name                                                 |
| `POSTGRES_USER`                 | `agent_toolkit`         | PostgreSQL username                                                      |
| `LOG_LEVEL`                     | `info`                  | `fatal` `error` `warn` `info` `debug` `trace`                            |
| `SESSION_TTL_MINUTES`           | `30`                    | Widget session lifetime                                                  |
| `CORS_MAX_AGE`                  | `86400`                 | CORS preflight cache (seconds)                                           |
| `SHUTDOWN_TIMEOUT_MS`           | `30000`                 | Graceful shutdown timeout                                                |
| `NODE_ENV`                      | `development`           | `development` `production` `test`                                        |
| `STORYBOOK_PORT`                | `6006`                  | Host port for the Storybook container                                    |
| `WIDGET_API_URL`                | `http://localhost:3000` | API URL baked into the Storybook build                                   |
| `IMAGE_TAG`                     | `latest`                | Docker image tag applied to built images                                 |
| `GEMINI_VERTEX_API_KEY`         | —                       | Optional Agentic HR assistant model secret; empty uses fallback behavior |
| `LANGGRAPH_PORT`                | `2024`                  | Host port for the Agentic `/chat` runtime                                |
| `LANGSTUDIO_PORT`               | `2025`                  | Host port for the LangGraph Studio dev API                               |
| `RAGFLOW_API_KEY`               | —                       | Optional Agentic HR document retriever key                               |
| `AI_RECRUITMENT_MCP_AUTH_TOKEN` | —                       | Optional bearer token for the recruitment MCP endpoint                   |

Non-secret recruitment MCP settings such as endpoint URL, timeout, search
limit, allowed tool name, protocol version, and maximum returned content length
are source-owned in `packages/agentic/src/constants.ts`.
