#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/home/appuser/family-learning"
COMPOSE_BIN="podman-compose"
COMPOSE_FILE="docker-compose.yml"

cd "$APP_DIR"

echo "[1/6] Fetch latest code"
git fetch --all --prune

echo "[2/6] Reset to origin/main"
git reset --hard origin/main

export BIND_HOST=127.0.0.1
export COMMIT_HASH=$(git rev-parse --short HEAD)

echo "[3/6] Stop old containers"
$COMPOSE_BIN -f "$COMPOSE_FILE" down || true

echo "[4/6] Rebuild and restart containers (${COMMIT_HASH})"
$COMPOSE_BIN -f "$COMPOSE_FILE" up -d --build

echo "[5/6] Health check"
curl --fail --silent --show-error http://localhost:3000 >/dev/null
curl --fail --silent --show-error http://localhost:8000 >/dev/null || true

echo "[6/6] Cleanup old images"
podman image prune -f

echo "Deploy done: https://62.238.10.244.nip.io"
