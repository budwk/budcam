#!/usr/bin/env bash
# Build & push BudCam Docker images to Docker Hub
#
# Usage:
#   DOCKER_USER=yourusername bash scripts/publish.sh
#   DOCKER_USER=yourusername VERSION=0.1.0 bash scripts/publish.sh
#
# Prerequisites:
#   1. docker buildx installed (docker buildx version)
#   2. Logged in to Docker Hub (docker login)
set -euo pipefail

# ── Config ──────────────────────────────────────────────
DOCKER_USER="${DOCKER_USER:-}"   # Required: your Docker Hub username
VERSION="${VERSION:-1.1.5}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
# ────────────────────────────────────────────────────────

if [ -z "$DOCKER_USER" ]; then
  echo "ERROR: DOCKER_USER is not set."
  echo "Usage: DOCKER_USER=yourusername bash scripts/publish.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo " BudCam Docker Publisher"
echo " User:      $DOCKER_USER"
echo " Version:   $VERSION"
echo " Platforms: $PLATFORMS"
echo "============================================"

# ── Backend API ────────────────────────────────────────
echo ""
echo ">>> [1/2] Building & pushing budcam-api ..."
docker buildx build \
  --platform "$PLATFORMS" \
  -t "${DOCKER_USER}/budcam-api:${VERSION}" \
  -t "${DOCKER_USER}/budcam-api:latest" \
  --push \
  -f "$ROOT/backend/Dockerfile" \
  "$ROOT/backend"
echo "      Done: ${DOCKER_USER}/budcam-api:${VERSION}"

# ── Frontend Web ───────────────────────────────────────
echo ""
echo ">>> [2/2] Building & pushing budcam-web ..."
docker buildx build \
  --platform "$PLATFORMS" \
  -t "${DOCKER_USER}/budcam-web:${VERSION}" \
  -t "${DOCKER_USER}/budcam-web:latest" \
  --push \
  -f "$ROOT/frontend/Dockerfile" \
  "$ROOT/frontend"
echo "      Done: ${DOCKER_USER}/budcam-web:${VERSION}"

# ── Summary ────────────────────────────────────────────
echo ""
echo "============================================"
echo " All images published successfully!"
echo ""
echo "  ${DOCKER_USER}/budcam-api:${VERSION}"
echo "  ${DOCKER_USER}/budcam-api:latest"
echo "  ${DOCKER_USER}/budcam-web:${VERSION}"
echo "  ${DOCKER_USER}/budcam-web:latest"
echo ""
echo " To deploy for end users:"
echo "  DOCKER_USER=${DOCKER_USER} docker compose -f docker-compose.release.yml up -d"
echo "============================================"
