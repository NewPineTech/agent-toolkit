#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  build       Build production Docker image
  up          Start all services (detached)
  down        Stop all services
  migrate     Run database migrations
  logs        Tail service logs
  restart     Rebuild and restart the server
  status      Show service status and health
  seed        Run the database seed script
EOF
  exit 1
}

check_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found. Copy .env.prod.example to .env.prod and fill in values."
    exit 1
  fi
}

case "${1:-}" in
  build)
    check_env
    docker compose -f "$COMPOSE_FILE" build --no-cache server
    ;;
  up)
    check_env
    docker compose -f "$COMPOSE_FILE" up -d
    echo "Services started. Run '$0 status' to check health."
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  migrate)
    check_env
    docker compose -f "$COMPOSE_FILE" --profile migrate run --rm migrate
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "${2:-server}"
    ;;
  restart)
    check_env
    docker compose -f "$COMPOSE_FILE" up -d --build server
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "Health checks:"
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}"
    ;;
  seed)
    check_env
    docker compose -f "$COMPOSE_FILE" exec server node -e \
      "require('child_process').execSync('npx tsx src/db/seed.ts', {stdio:'inherit', cwd:'/app/packages/server'})"
    ;;
  *)
    usage
    ;;
esac
