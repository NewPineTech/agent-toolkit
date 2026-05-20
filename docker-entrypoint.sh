#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ] && [ -n "${POSTGRES_DB:-}" ]; then
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
fi

cd /app/packages/server
echo "Running database migrations..."
node dist/db/migrate.js
cd /app
echo "Starting server..."
exec "$@"
