#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/home/appuser/family-learning"
COMPOSE_BIN="podman-compose"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$APP_DIR"

echo "[1/7] Fetch latest code"
git fetch --all --prune

echo "[2/7] Reset to origin/main"
git reset --hard origin/main

echo "[3/7] Ensure prod compose file exists"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE"
  exit 1
fi

echo "[4/7] Stop old containers"
$COMPOSE_BIN -f "$COMPOSE_FILE" down || true

export COMMIT_HASH=$(git rev-parse --short HEAD)

echo "[5/7] Rebuild and restart containers (${COMMIT_HASH})"
$COMPOSE_BIN -f "$COMPOSE_FILE" up -d --build

echo "[6/7] Health check"
curl --fail --silent --show-error http://localhost:3000 >/dev/null
curl --fail --silent --show-error http://localhost:8000 >/dev/null || true

echo "[7/7] Cleanup old images"
podman image prune -f

echo "Deploy done: https://62.238.10.244.nip.io"
