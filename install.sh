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

# ── Configuration ───────────────────────────────────────────────────
REPO_URL="https://github.com/NewPineTech/agent-toolkit.git"
INSTALL_DIR="${AGENT_TOOLKIT_DIR:-agent-toolkit}"

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
check_command node      "Install from https://nodejs.org (>= 20)"
check_command pnpm      "Install with: npm install -g pnpm"
check_command docker    "Install from https://docs.docker.com/get-docker"

check_version node 20.0 "Install from https://nodejs.org"
check_version pnpm 9.0  "Upgrade with: npm install -g pnpm@latest"

if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
  fail "docker compose (v2) is required. Update Docker Desktop or install the compose plugin."
fi
ok "docker compose"

echo ""

# ── Clone ───────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Directory '$INSTALL_DIR' already exists — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "Pull failed; continuing with existing code."
else
  info "Cloning $REPO_URL → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
ok "Repository ready at $(pwd)"
echo ""

# ── Install dependencies ───────────────────────────────────────────
info "Installing dependencies (pnpm install)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"
echo ""

# ── Environment file ───────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env

  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 64)
  POSTGRES_PASSWORD=$(openssl rand -base64 24 2>/dev/null || head -c 32 /dev/urandom | base64 | head -c 32)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|your-jwt-secret-must-be-at-least-32-characters-long|$JWT_SECRET|" .env
    sed -i '' "s|CHANGE_ME_generate_with_openssl_rand_hex_32|$ENCRYPTION_KEY|" .env
    sed -i '' "s|POSTGRES_PASSWORD=dev_password|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
    sed -i '' "s|dev_password@localhost|$POSTGRES_PASSWORD@localhost|" .env
  else
    sed -i "s|your-jwt-secret-must-be-at-least-32-characters-long|$JWT_SECRET|" .env
    sed -i "s|CHANGE_ME_generate_with_openssl_rand_hex_32|$ENCRYPTION_KEY|" .env
    sed -i "s|POSTGRES_PASSWORD=dev_password|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
    sed -i "s|dev_password@localhost|$POSTGRES_PASSWORD@localhost|" .env
  fi

  ok "Generated .env with random secrets"
else
  ok ".env already exists — skipping"
fi
echo ""

# ── Start infrastructure ───────────────────────────────────────────
info "Starting PostgreSQL and Redis..."
docker compose up -d postgres redis
ok "Infrastructure is running"
echo ""

# ── Wait for services ──────────────────────────────────────────────
info "Waiting for PostgreSQL to be ready..."
retries=30
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-agent_toolkit}" &>/dev/null || [ $retries -eq 0 ]; do
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
(cd packages/server && npx drizzle-kit migrate 2>/dev/null) && ok "Migrations applied" || warn "Migration failed — you can retry with: cd packages/server && npx drizzle-kit migrate"
echo ""

# ── Done ────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}✔ Agent Toolkit installed successfully!${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo ""
echo -e "    ${CYAN}cd $INSTALL_DIR${NC}"
echo -e "    ${CYAN}pnpm dev${NC}              # Start the dev server on :3000"
echo ""
echo -e "  ${BOLD}Optional:${NC}"
echo ""
echo -e "    Edit ${YELLOW}.env${NC} to configure RAGFlow provider settings"
echo -e "    ${CYAN}cd packages/server && npx tsx src/db/seed.ts${NC}   # Seed a dev workspace"
echo -e "    ${CYAN}cd packages/widget && pnpm storybook${NC}           # Launch Storybook"
echo ""
echo -e "  ${BOLD}Docs:${NC} https://github.com/NewPineTech/agent-toolkit#readme"
echo ""
