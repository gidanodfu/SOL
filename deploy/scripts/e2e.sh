#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

# Ejecuta la suite E2E con Chromium headless dentro de una imagen propia
# (Node + Headless Shell). El navegador vive fuera del repositorio.
E2E_IMAGE="sol_e2e:local"
BASE_URL=${E2E_BASE_URL:-"http://localhost:$(env_get DEV_FRONTEND_PORT 2>/dev/null || printf '5173')"}
ARTIFACTS=${E2E_ARTIFACTS:-"${TMPDIR:-/tmp}/sol-e2e-artifacts"}

require_repo
docker_available
case "$BASE_URL" in
    http://*|https://*) ;;
    *) die "E2E_BASE_URL debe ser una URL http(s)." ;;
esac
mkdir -p "$ARTIFACTS"
chmod 700 "$ARTIFACTS" 2>/dev/null || true

if ! docker image inspect "$E2E_IMAGE" >/dev/null 2>&1; then
    printf 'Construyendo imagen E2E (Node + Chromium Headless Shell)...\n'
    docker build -t "$E2E_IMAGE" -f "$ROOT/deploy/e2e/Dockerfile" "$ROOT/deploy/e2e" >/dev/null
fi

printf 'Ejecutando E2E con Chromium en %s...\n' "$BASE_URL"
docker run --rm --network host \
    -v "$ROOT/tests/e2e:/e2e:ro" \
    -v "$ARTIFACTS:/artifacts" \
    -e E2E_BASE_URL="$BASE_URL" \
    -e E2E_ARTIFACTS=/artifacts \
    -e E2E_ADMIN_USER -e E2E_ADMIN_PASS \
    -e E2E_EMPRESA_USER -e E2E_EMPRESA_PASS \
    -e E2E_POSTULANTE_USER -e E2E_POSTULANTE_PASS \
    "$E2E_IMAGE" \
    sh -c 'cp -R /e2e /tmp/e2e && cd /tmp/e2e && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null && node e2e.mjs'

printf 'Evidencias E2E: %s\n' "$ARTIFACTS"
