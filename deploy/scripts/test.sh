#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

require_repo
docker_available
validate_env_basics

TARGET="${1:-all}"
case "$TARGET" in
    all|backend|frontend) ;;
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/test.sh [all|backend|frontend]

Ejecuta pruebas dentro de contenedores de desarrollo. No instala dependencias
en el host ni modifica datos de producción.
USAGE
        exit 0
        ;;
    *) die "Objetivo inválido: $TARGET" ;;
esac

compose_dev build backend frontend
compose_dev up -d db
wait_for_service compose_dev db 60

if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
    printf 'Pruebas backend...\n'
    compose_dev run --rm --no-deps backend php vendor/bin/phpunit --no-coverage
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
    printf 'Pruebas y compilación frontend...\n'
    compose_dev run --rm --no-deps frontend sh -c 'npm test && npm run build'
fi

printf 'Pruebas completadas para: %s\n' "$TARGET"
