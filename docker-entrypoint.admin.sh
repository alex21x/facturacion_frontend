#!/bin/sh
set -e

# In LAN mode we keep VITE_API_BASE_URL empty so the app derives the backend
# host from the browser URL instead of hardcoding localhost.
RESOLVED_VITE_API_BASE_URL="${VITE_API_BASE_URL}"
if [ -z "$RESOLVED_VITE_API_BASE_URL" ] && [ "${DOCKER_BIND_HOST:-127.0.0.1}" != "0.0.0.0" ]; then
  RESOLVED_VITE_API_BASE_URL="http://127.0.0.1:${VITE_BACKEND_PORT:-8000}"
fi

# Create .env.local with resolved runtime values
{
  echo "VITE_API_BASE_URL=${RESOLVED_VITE_API_BASE_URL}"
  echo "VITE_BACKEND_PORT=${VITE_BACKEND_PORT:-8000}"
  echo "VITE_HOST=${VITE_HOST:-0.0.0.0}"
  echo "VITE_ADMIN_HOST=${VITE_ADMIN_HOST:-0.0.0.0}"
  echo "VITE_ADMIN_PORT=${VITE_ADMIN_PORT:-5174}"
} > .env.local

# Start Vite dev server for admin
exec npm run dev:admin -- --host 0.0.0.0 --port "${VITE_ADMIN_PORT:-5174}"
