#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  build       Build production Docker images
  up          Start all services (detached)
  down        Stop all services
  migrate     Run database migrations
  logs        Tail service logs
  restart     Rebuild and restart the server
  status      Show service status and health
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
    $COMPOSE build --no-cache server langgraph langstudio storybook
    ;;
  up)
    check_env
    $COMPOSE up -d
    echo "Services started. Run '$0 status' to check health."
    ;;
  down)
    $COMPOSE down
    ;;
  migrate)
    check_env
    $COMPOSE run --rm --entrypoint "" server sh -c 'cd /app/packages/server && node dist/db/migrate.js'
    ;;
  logs)
    $COMPOSE logs -f --tail=100 "${2:-server}"
    ;;
  restart)
    check_env
    $COMPOSE up -d --build server langgraph langstudio
    ;;
  status)
    $COMPOSE ps
    echo ""
    echo "Health checks:"
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}"
    ;;
  *)
    usage
    ;;
esac
