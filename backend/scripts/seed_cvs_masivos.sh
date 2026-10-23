#!/bin/sh
# Sube los CV ficticios del dataset masivo usando la API real de SOL.
# Todo se ejecuta en Docker: no requiere PHP, Python, curl ni MySQL en el host.
set -eu

. "$(dirname -- "$0")/../../deploy/scripts/lib/common.sh"

require_repo
docker_available
require_env_file
require_project_name

TEST_IMAGE=sol_backend_test:local
NET="$(project_name)_internal"

if ! docker network inspect "$NET" >/dev/null 2>&1; then
    die "No existe la red $NET. Ejecute ./deploy/scripts/dev.sh up y vuelva a intentarlo."
fi

VOL="$(project_name)_backend_writable"
docker volume inspect "$VOL" >/dev/null 2>&1 \
    || die "No existe el volumen $VOL. Ejecute dev.sh up y DatosMasivosSeeder antes de este script."

printf 'Construyendo imagen de herramientas de prueba...\n'
docker build --target test -t "$TEST_IMAGE" -f "$ROOT/backend/Dockerfile" "$ROOT" >/dev/null

printf 'Subiendo CV ficticios contra el backend de desarrollo (%s)...\n' "$NET"
docker run --rm --network "$NET" \
    -v "$ROOT/backend/scripts:/workspace/scripts:ro" \
    -v "$VOL:/workspace/writable:ro" \
    "$TEST_IMAGE" python3 /workspace/scripts/cvs_masivos.py "http://backend:8080"
