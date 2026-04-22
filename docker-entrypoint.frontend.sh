#!/bin/sh
set -e

# Create .env.local with VITE_API_BASE_URL from environment
{
  echo "VITE_API_BASE_URL=${VITE_API_BASE_URL:-http://127.0.0.1:8000}"
  echo "VITE_HOST=${VITE_HOST:-0.0.0.0}"
  echo "VITE_PORT=${VITE_PORT:-5173}"
} > .env.local

# Start Vite dev server
exec npm run dev -- --host 0.0.0.0 --port "${VITE_PORT:-5173}"
