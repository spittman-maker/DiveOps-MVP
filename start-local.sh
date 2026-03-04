#!/bin/bash
# DiveOps MVP - Local Development Startup Script
# This script starts the app with proper environment variables

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== DiveOps MVP Local Startup ==="

# Check PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
  echo "Starting PostgreSQL..."
  pg_ctlcluster 15 main start 2>/dev/null || service postgresql start
fi

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "✓ Environment loaded from .env"
else
  echo "ERROR: .env file not found!"
  exit 1
fi

# Apply required patches to dist/index.cjs
echo "Applying patches..."

# Patch 1: Fix secure cookie (was hardcoded to true in production build)
sed -i 's/saveUninitialized:!1,cookie:{maxAge:1e3\*60\*60\*24\*7,httpOnly:!0,secure:!0}/saveUninitialized:!1,cookie:{maxAge:1e3*60*60*24*7,httpOnly:!0,secure:!1}/g' dist/index.cjs 2>/dev/null || true

# Patch 2: Ensure table.sql exists for connect-pg-simple
if [ ! -f dist/table.sql ]; then
  cp node_modules/connect-pg-simple/table.sql dist/table.sql
  echo "✓ Copied table.sql to dist/"
fi

echo "✓ Patches applied"

# Start the app
echo "Starting DiveOps on port ${PORT:-3000}..."
NODE_ENV=development PORT=${PORT:-3000} node dist/index.cjs