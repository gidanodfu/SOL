#!/bin/sh
# Verifica que el contexto Docker excluya metadatos Git/GitHub y conserve los
# archivos necesarios para construir y ejecutar SOL.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/sol-docker-context.XXXXXX")
IMG="sol_docker_context_test_$$"

cleanup() {
    docker rmi -f "$IMG" >/dev/null 2>&1 || true
    rm -rf "$TMP"
}
trap cleanup EXIT HUP INT TERM

cat > "$TMP/Dockerfile" <<'DOCKER'
FROM nginx:1.27.5-alpine
COPY . /ctx
RUN test ! -e /ctx/.git \
    && test ! -e /ctx/.github \
    && test -z "$(find /ctx -name .git -o -name .github)" \
    && test -f /ctx/VERSION \
    && test -f /ctx/backend/app/Config/Routes.php \
    && test -f /ctx/backend/composer.json \
    && test -f /ctx/frontend/package.json \
    && test -f /ctx/frontend/src/main.jsx \
    && test -f /ctx/frontend/nginx.conf \
    && test -f /ctx/deploy/compose.yaml
DOCKER

if docker build -q -t "$IMG" -f "$TMP/Dockerfile" "$ROOT" >/dev/null; then
    printf 'OK   contexto Docker sin .git/.github y con archivos necesarios\n'
else
    printf 'FAIL el contexto Docker contiene metadatos Git/GitHub o perdió archivos necesarios\n' >&2
    exit 1
fi
