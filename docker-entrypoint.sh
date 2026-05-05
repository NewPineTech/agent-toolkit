#!/bin/sh
set -e
cd /app/packages/server
echo "Running database migrations..."
node dist/db/migrate.js
cd /app
echo "Starting server..."
exec "$@"
