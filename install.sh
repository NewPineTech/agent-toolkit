#!/usr/bin/env bash
# Quick installer for Agent Toolkit
# Usage: curl -fsSL https://raw.githubusercontent.com/NewPineTech/agent-toolkit/main/install.sh | bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

prompt_or_default() {
  local prompt_text="$1" default_val="$2" var_name="$3"
  local input
  if [ -n "$default_val" ]; then
    read -rp "$(echo -e "${CYAN}$prompt_text${NC} [${default_val}]: ")" input </dev/tty
    printf -v "$var_name" '%s' "${input:-$default_val}"
  else
    read -rp "$(echo -e "${CYAN}$prompt_text${NC}: ")" input </dev/tty
    while [ -z "$input" ]; do
      echo -e "${RED}  This field is required.${NC}"
      read -rp "$(echo -e "${CYAN}$prompt_text${NC}: ")" input </dev/tty
    done
    printf -v "$var_name" '%s' "$input"
  fi
}

prompt_optional() {
  local prompt_text="$1" default_val="$2" var_name="$3"
  local input
  if [ -n "$default_val" ]; then
    read -rp "$(echo -e "${CYAN}$prompt_text${NC} [${default_val}]: ")" input </dev/tty
    printf -v "$var_name" '%s' "${input:-$default_val}"
  else
    read -rp "$(echo -e "${CYAN}$prompt_text${NC}: ")" input </dev/tty
    printf -v "$var_name" '%s' "$input"
  fi
}

generate_secret() {
  openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 64
}

# ── Configuration ───────────────────────────────────────────────────
REPO_URL="https://github.com/NewPineTech/agent-toolkit.git"
INSTALL_DIR="${AGENT_TOOLKIT_DIR:-agent-toolkit}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
ENV_EXAMPLE=".env.prod.example"

# ── Banner ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Agent Toolkit — Quick Install      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Prerequisite checks ────────────────────────────────────────────
check_command() {
  if ! command -v "$1" &>/dev/null; then
    fail "$1 is required but not installed. $2"
  fi
}

check_version() {
  local cmd="$1" min="$2" hint="$3"
  local current
  current=$($cmd --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
  if [ -z "$current" ]; then
    fail "Could not determine $cmd version."
  fi
  local cur_major cur_minor min_major min_minor
  cur_major=$(echo "$current" | cut -d. -f1)
  cur_minor=$(echo "$current" | cut -d. -f2)
  min_major=$(echo "$min" | cut -d. -f1)
  min_minor=$(echo "$min" | cut -d. -f2)
  if [ "$cur_major" -lt "$min_major" ] || { [ "$cur_major" -eq "$min_major" ] && [ "$cur_minor" -lt "$min_minor" ]; }; then
    fail "$cmd $current found, but >= $min is required. $hint"
  fi
  ok "$cmd $current (>= $min)"
}

info "Checking prerequisites..."

check_command git       "Install from https://git-scm.com"
check_command node      "Install from https://nodejs.org (>= 22)"
check_command pnpm      "Install with: npm install -g pnpm"
check_command docker    "Install from https://docs.docker.com/get-docker"

check_version node 22.0 "Install from https://nodejs.org"
check_version pnpm 9.0  "Upgrade with: npm install -g pnpm@latest"

if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
  fail "docker compose (v2) is required. Update Docker Desktop or install the compose plugin."
fi
ok "docker compose"

echo ""

# ── Clone ───────────────────────────────────────────────────────────
if [ -f "$(pwd)/package.json" ] && [ -d "$(pwd)/.git" ]; then
  # Running from inside the local repo — skip clone
  ok "Using local repository at $(pwd)"
elif [ -d "$INSTALL_DIR/.git" ]; then
  info "Directory '$INSTALL_DIR' already exists — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "Pull failed; continuing with existing code."
  cd "$INSTALL_DIR"
else
  info "Cloning $REPO_URL → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
ok "Repository ready at $(pwd)"
echo ""

# ── Install dependencies ───────────────────────────────────────────
info "Installing dependencies (pnpm install)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"
echo ""

# ── Link CLI command ───────────────────────────────────────────────
info "Linking Agent Toolkit CLI command..."
if pnpm link --global >/dev/null 2>&1 && command -v agent-toolkit >/dev/null 2>&1; then
  ok "CLI available as: agent-toolkit (or atk)"
else
  warn "Could not add agent-toolkit to PATH automatically."
  warn "Run 'pnpm setup', restart your shell, then re-run: pnpm link --global"
fi
echo ""

# ── Server port configuration ──────────────────────────────────────
echo -e "${BOLD}── Server Configuration ─────────────────────────────${NC}"
echo ""
prompt_or_default "Server port" "3000" SERVER_PORT
prompt_optional "Widget API URL for clients (optional)" "${WIDGET_API_URL:-}" WIDGET_API_URL
if [ -n "$WIDGET_API_URL" ]; then
  ok "Widget API URL: $WIDGET_API_URL"
else
  ok "Widget API URL left empty"
fi
echo ""

# ── Environment file ───────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  info "Creating $ENV_FILE from $ENV_EXAMPLE..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Auto-generate secrets
  JWT_SECRET=$(generate_secret)
  ENCRYPTION_KEY=$(generate_secret)
  POSTGRES_PASSWORD=$(generate_secret)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
    sed -i '' "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" "$ENV_FILE"
    sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_FILE"
    sed -i '' "s|^PORT=.*|PORT=$SERVER_PORT|" "$ENV_FILE"
  else
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
    sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" "$ENV_FILE"
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_FILE"
    sed -i "s|^PORT=.*|PORT=$SERVER_PORT|" "$ENV_FILE"
  fi

  ok "Generated $ENV_FILE with random secrets (PORT=$SERVER_PORT)"
else
  ok "$ENV_FILE already exists — skipping secret generation"
  # Still update port if user changed it
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^PORT=.*|PORT=$SERVER_PORT|" "$ENV_FILE"
  else
    sed -i "s|^PORT=.*|PORT=$SERVER_PORT|" "$ENV_FILE"
  fi
  ok "Updated PORT=$SERVER_PORT in $ENV_FILE"
fi
echo ""

# ── Load env for docker compose ────────────────────────────────────
# docker-compose.prod.yml uses ${POSTGRES_PASSWORD:?...} which requires
# the variable in the shell environment. Docker Compose only auto-loads
# a file named ".env", not ".env.prod", so we must pass --env-file explicitly.
COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

# ── Build production images ────────────────────────────────────────
info "Building server image..."
$COMPOSE build server
ok "Server image built"
echo ""

info "Building Storybook image (WIDGET_API_URL=$WIDGET_API_URL)..."
WIDGET_API_URL="$WIDGET_API_URL" $COMPOSE build storybook
ok "Storybook image built"
echo ""

# ── Start infrastructure ───────────────────────────────────────────
info "Starting PostgreSQL and Redis..."
$COMPOSE up -d postgres redis
ok "Infrastructure is running"
echo ""

# ── Wait for services ──────────────────────────────────────────────
info "Waiting for PostgreSQL to be ready..."
retries=30
until [ "$($COMPOSE ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}')" = "healthy" ] || [ $retries -eq 0 ]; do
  retries=$((retries - 1))
  sleep 1
done
if [ $retries -eq 0 ]; then
  warn "PostgreSQL health check timed out. It may still be starting."
else
  ok "PostgreSQL is ready"
fi

# ── Run migrations ─────────────────────────────────────────────────
info "Running database migrations..."
$COMPOSE run --rm --entrypoint "" server sh -c 'cd /app/packages/server && node dist/db/migrate.js' \
  && ok "Migrations applied" \
  || warn "Migration failed — you can retry with: ./scripts/deploy.sh migrate"
echo ""

# ── Workspace creation ─────────────────────────────────────────────
echo -e "${BOLD}── Workspace Setup ─────────────────────────────────${NC}"
echo ""
echo -e "  A workspace connects the widget to your RAGFlow agent."
echo -e "  Quick setup only asks for the required RAGFlow values."
echo ""

read -rp "$(echo -e "${CYAN}Create a workspace now? (Y/n)${NC}: ")" CREATE_WS </dev/tty
CREATE_WS="${CREATE_WS:-Y}"

if [[ "$CREATE_WS" =~ ^[Yy]$ ]]; then
  echo ""
  prompt_or_default "Workspace ID (e.g. ws_my_project)" "" WS_ID
  prompt_or_default "RAGFlow agent UUID" "" WS_AGENT_ID
  prompt_or_default "RAGFlow API key" "" WS_API_KEY
  prompt_or_default "RAGFlow server URL (e.g. https://ragflow.example.com)" "" WS_BASE_URL
  WS_DOMAINS="*"
  WS_AUTH_MODE="${WORKSPACE_AUTH_MODE:-anonymous}"
  WS_MAX_REQUESTS="${WORKSPACE_MAX_REQUESTS:-30}"
  WS_WINDOW_MS="${WORKSPACE_WINDOW_MS:-60000}"
  ok "Allowed domains: * (all origins)"
  ok "Auth mode: $WS_AUTH_MODE"
  ok "Rate limit: $WS_MAX_REQUESTS requests / ${WS_WINDOW_MS}ms"
  echo ""

  # Source .env.prod to get POSTGRES_PASSWORD and ENCRYPTION_KEY
  set -a
  source "$ENV_FILE"
  set +a

  info "Creating workspace..."

  workspace_args=(
    --id "$WS_ID"
    --agent-id "$WS_AGENT_ID"
    --api-key "$WS_API_KEY"
    --base-url "$WS_BASE_URL"
    --auth-mode "$WS_AUTH_MODE"
    --max-requests "$WS_MAX_REQUESTS"
    --window-ms "$WS_WINDOW_MS"
    --domains "$WS_DOMAINS"
  )

  # Run the Agent Toolkit CLI inside the server container (has network access to postgres)
  $COMPOSE run --rm \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-agent_toolkit}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-agent_toolkit}" \
    -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
    --entrypoint "" \
    server \
    atk workspace create "${workspace_args[@]}" \
    && ok "Workspace '${WS_ID}' created successfully" \
    || warn "Workspace creation failed. Retry with: docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace create"
  echo ""
else
  echo ""
  info "Skipping workspace creation. You can create one later with:"
  echo -e "    ${CYAN}docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace create --id ws_my_project --agent-id <UUID> --api-key <KEY> --base-url <URL> --domains \"*\"${NC}"
  echo ""
fi

# ── Start server ───────────────────────────────────────────────────
info "Starting the full stack..."
$COMPOSE up -d
ok "All services started"
echo ""

# ── Done ────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}✔ Agent Toolkit installed successfully!${NC}"
echo ""
echo -e "  ${BOLD}Server running at:${NC}    ${CYAN}http://localhost:${SERVER_PORT}${NC}"
echo -e "  ${BOLD}Storybook running at:${NC} ${CYAN}http://localhost:${STORYBOOK_PORT:-6006}${NC}"
echo ""
echo -e "  ${BOLD}Verify:${NC}"
echo ""
echo -e "    ${CYAN}curl http://localhost:${SERVER_PORT}/health/ready${NC}"
echo -e "    ${CYAN}curl -I http://localhost:${STORYBOOK_PORT:-6006}/${NC}"
echo ""
echo -e "  ${BOLD}Manage:${NC}"
echo ""
echo -e "    ${CYAN}cd $INSTALL_DIR${NC}"
echo -e "    ${CYAN}./scripts/deploy.sh status${NC}    # Check service health"
echo -e "    ${CYAN}./scripts/deploy.sh logs${NC}      # Tail server logs"
echo -e "    ${CYAN}docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace list${NC}  # List configured workspaces"
echo -e "    ${CYAN}docker compose --env-file .env.prod -f docker-compose.prod.yml exec server atk workspace get <workspaceId>${NC}"
echo -e "    ${CYAN}agent-toolkit widget iframe <workspaceId> --api-url http://localhost:${SERVER_PORT}${NC}"
echo -e "    ${CYAN}agent-toolkit chat ask <workspaceId> \"Hello\" --api-url http://localhost:${SERVER_PORT}${NC}"
echo ""
echo -e "  ${BOLD}Docs:${NC} See DEPLOYMENT.md for production deployment details"
echo ""
