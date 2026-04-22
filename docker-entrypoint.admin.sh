#!/bin/sh
set -e

# Create .env.local with VITE_API_BASE_URL from environment
{
  echo "VITE_API_BASE_URL=${VITE_API_BASE_URL:-http://127.0.0.1:8000}"
  echo "VITE_HOST=${VITE_HOST:-0.0.0.0}"
  echo "VITE_ADMIN_HOST=${VITE_ADMIN_HOST:-0.0.0.0}"
  echo "VITE_ADMIN_PORT=${VITE_ADMIN_PORT:-5174}"
} > .env.local

# Start Vite dev server for admin
exec npm run dev:admin -- --host 0.0.0.0 --port "${VITE_ADMIN_PORT:-5174}"
