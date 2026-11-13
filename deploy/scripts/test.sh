#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"
. "$ROOT/.github/scripts/docker-retry.sh"

TARGET=all
BUILD=1
for arg in "$@"; do
    case "$arg" in
        all|backend|frontend|http|smoke|validation|e2e|audit|compatibility|php-lint) TARGET=$arg ;;
        --no-build) BUILD=0 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/test.sh [all|backend|frontend|http|smoke|e2e|audit|compatibility|php-lint|validation] [--no-build]

Ejecuta las pruebas dentro de contenedores; no instala dependencias en el host.

  all         pruebas backend + frontend + build (por defecto)
  backend     PHPUnit dentro del contenedor backend
  frontend    npm test + lint + build dentro del contenedor frontend
  http        smoke HTTP no destructivo contra el stack de desarrollo activo
  smoke       suite de humo aislada en un MariaDB temporal con esquema por suite
  e2e         navegador Chromium headless contra el stack activo
  audit       auditoría de integridad de la base MariaDB activa
  compatibility  MySQL 8.0.46 -> MariaDB 11.4.13 con comparación determinista
  php-lint    sintaxis de todos los archivos PHP
  validation  validación de variables y del contexto Docker

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
    "$ROOT/deploy/scripts/smoke.sh" || exit $?
    exit 0
fi

if [ "$TARGET" = "e2e" ]; then
    "$ROOT/deploy/scripts/e2e.sh" || exit $?
    exit 0
fi

if [ "$TARGET" = "compatibility" ]; then
    "$ROOT/deploy/scripts/compare-mysql-mariadb.sh" || exit $?
    exit 0
fi

if [ "$TARGET" = "php-lint" ]; then
    PHP_IMAGE=sol_backend_test:local
    if ! docker image inspect "$PHP_IMAGE" >/dev/null 2>&1; then
        docker build --target test -t "$PHP_IMAGE" -f "$ROOT/backend/Dockerfile" "$ROOT" >/dev/null
    fi
    docker run --rm -v "$ROOT/backend:/src:ro" -v "$ROOT/tests/tools:/tools:ro" "$PHP_IMAGE" \
        sh -c 'find /src/app /src/tests /tools -name "*.php" -exec php -l {} \;'
    exit 0
fi

if [ "$TARGET" = "audit" ]; then
    require_service_running compose_dev backend
    prepare_backend_env
    AUDIT_IMAGE=sol_backend_test:local
    if ! docker image inspect "$AUDIT_IMAGE" >/dev/null 2>&1; then
        docker build --target test -t "$AUDIT_IMAGE" -f "$ROOT/backend/Dockerfile" "$ROOT" >/dev/null
    fi
    NET_NAME="$(project_name)_internal"
    docker run --rm --network "$NET_NAME" --env-file "$BACKEND_ENV_FILE" \
        -e DB_HOST=db -e DB_PORT=3306 \
        -v "$ROOT/tests:/var/www/sol/tests:ro" \
        "$AUDIT_IMAGE" php /var/www/sol/tests/tools/audit_database_integrity.php
    exit $?
fi

if [ "$TARGET" = "validation" ]; then
    "$ROOT/tests/deploy/test_validation.sh"
    "$ROOT/tests/deploy/test_docker_context.sh"
    "$ROOT/tests/deploy/test_docker_retry.sh"
    "$ROOT/tests/deploy/test_bootstrap.sh"
    exit 0
fi

if [ "$TARGET" = "http" ]; then
    require_service_running compose_dev backend
    require_service_running compose_dev frontend
    HTTP_IMAGE=sol_backend_test:local
    if ! docker image inspect "$HTTP_IMAGE" >/dev/null 2>&1; then
        printf 'Construyendo imagen de diagnóstico HTTP...\n'
        docker build --target test -t "$HTTP_IMAGE" -f "$ROOT/backend/Dockerfile" "$ROOT" >/dev/null
    fi
    NET=$(docker network ls --format '{{.Name}}' | grep -Fx "$(project_name)_internal" | head -n 1)
    [ -n "$NET" ] || die "No se encontró la red interna del proyecto Compose."
    printf 'Ejecutando smoke HTTP no destructivo dentro de Docker...\n'
    docker run --rm --network "$NET" \
        -v "$ROOT/tests:/var/www/sol/tests:ro" \
        -e B=http://backend:8080 \
        -e F=http://frontend:5173 \
        "$HTTP_IMAGE" bash /var/www/sol/tests/smoke/test_docker_http.sh
    exit 0
fi

if [ "$BUILD" = "1" ]; then
    printf 'Construyendo imágenes de desarrollo...\n'
    docker_retry compose_dev build backend frontend
fi

docker_retry compose_dev up -d db
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
