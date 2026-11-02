#!/bin/sh
# Construye las imágenes de producción y verifica que no incluyan metadatos
# Git/GitHub y que conserven los artefactos mínimos de ejecución.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SUFFIX=$$
BACK="sol_prod_images_test_backend_$SUFFIX"
FRONT="sol_prod_images_test_frontend_$SUFFIX"
LOG=$(mktemp "${TMPDIR:-/tmp}/sol-prod-images.XXXXXX")

cleanup() {
    docker rmi -f "$BACK" "$FRONT" >/dev/null 2>&1 || true
    rm -f "$LOG"
}
trap cleanup EXIT HUP INT TERM

if ! docker build -f "$ROOT/backend/Dockerfile" --target prod -t "$BACK" "$ROOT" >"$LOG" 2>&1; then
    tail -30 "$LOG" >&2
    printf 'FAIL no se pudo construir la imagen backend de producción\n' >&2
    exit 1
fi
printf 'OK   imagen backend de producción construida\n'

if ! docker build -f "$ROOT/frontend/Dockerfile" --target prod -t "$FRONT" "$ROOT" >"$LOG" 2>&1; then
    tail -30 "$LOG" >&2
    printf 'FAIL no se pudo construir la imagen frontend de producción\n' >&2
    exit 1
fi
printf 'OK   imagen frontend de producción construida\n'

if docker run --rm "$BACK" sh -c '
    test -f /var/www/sol/backend/public/index.php     && test -f /var/www/sol/backend/spark     && test -z "$(find / -name .git -o -name .github 2>/dev/null)"
' >/dev/null 2>&1; then
    printf 'OK   backend de producción sin .git/.github y con artefactos necesarios\n'
else
    printf 'FAIL backend de producción contiene metadatos Git/GitHub o pierde artefactos\n' >&2
    exit 1
fi

if docker run --rm "$FRONT" sh -c '
    test -f /usr/share/nginx/html/index.html     && test -z "$(find / -name .git -o -name .github 2>/dev/null)"
' >/dev/null 2>&1; then
    printf 'OK   frontend de producción sin .git/.github y con dist\n'
else
    printf 'FAIL frontend de producción contiene metadatos Git/GitHub o pierde dist\n' >&2
    exit 1
fi
