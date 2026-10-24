#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

TARGET=all
BUILD=1
for arg in "$@"; do
    case "$arg" in
        all|backend|frontend|http|smoke|validation) TARGET=$arg ;;
        --no-build) BUILD=0 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/test.sh [all|backend|frontend|http|smoke|validation] [--no-build]

Ejecuta las pruebas dentro de contenedores; no instala dependencias en el host
ni modifica datos de producción.

  all         pruebas backend + frontend + build (por defecto)
  backend     PHPUnit dentro del contenedor backend
  frontend    npm test + lint + build dentro del contenedor frontend
  http        smoke HTTP no destructivo contra el stack de desarrollo activo
  smoke       smoke tests históricos en un MySQL temporal aislado en Docker
  validation  validación de variables y health interno sin DNS público

Opciones:
  --no-build  reutiliza las imágenes existentes en lugar de reconstruirlas.
USAGE
            exit 0
            ;;
        *) die "Argumento desconocido: $arg" ;;
    esac
done

require_repo
docker_available
validate_env_basics
require_dev_project

printf 'Validando configuración antes de las pruebas...\n'
"$ROOT/deploy/scripts/validate.sh" --dev

if [ "$TARGET" = "smoke" ]; then
    "$ROOT/deploy/scripts/smoke.sh"
    exit 0
fi

if [ "$TARGET" = "validation" ]; then
    "$ROOT/tests/deploy/test_validation.sh"
    "$ROOT/tests/deploy/test_internal_health.sh"
    "$ROOT/tests/infra/test_traefik_acme.sh"
    exit 0
fi

if [ "$TARGET" = "http" ]; then
    require_service_running compose_dev backend
    require_service_running compose_dev frontend
    B="http://127.0.0.1:$(env_get DEV_API_PORT)"
    F="http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)"
    printf 'Ejecutando smoke HTTP no destructivo (%s, %s)...\n' "$B" "$F"
    B="$B" F="$F" "$ROOT/tests/smoke/test_docker_http.sh"
    exit 0
fi

if [ "$BUILD" = "1" ]; then
    printf 'Construyendo imágenes de desarrollo...\n'
    compose_dev build backend frontend
fi

compose_dev up -d db
wait_for_service compose_dev db 60

if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
    printf 'Pruebas backend...\n'
    compose_dev run --rm --no-deps backend php vendor/bin/phpunit --no-coverage
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
    printf 'Pruebas, lint y compilación frontend...\n'
    compose_dev run --rm --no-deps frontend sh -c 'npm test && npm run lint && npm run build'
fi

printf 'Pruebas completadas para: %s\n' "$TARGET"
