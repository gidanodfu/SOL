#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

require_repo
docker_available

case "${1:-help}" in
    up)
        validate_env_basics
        compose_dev up -d --build
        wait_for_service compose_dev db 60
        wait_for_service compose_dev backend 90
        wait_for_service compose_dev frontend 60
        printf 'SOL desarrollo: %s\n' "$(env_get APP_URL)"
        ;;
    down)
        compose_dev down
        printf 'Servicios detenidos. Los volúmenes se conservaron.\n'
        ;;
    restart)
        compose_dev restart
        ;;
    status)
        compose_dev ps
        ;;
    logs)
        shift
        compose_dev logs -f --tail=200 "$@"
        ;;
    build)
        compose_dev build
        ;;
    migrate)
        validate_env_basics
        compose_dev run --rm backend php spark migrate --all
        ;;
    seed)
        validate_env_basics
        seeder="${2:-SystemSeeder}"
        printf 'Ejecutando seeder %s (puede modificar datos de desarrollo).\n' "$seeder"
        export_admin_credentials
        compose_dev run --rm -e INITIAL_ADMIN_USERNAME -e INITIAL_ADMIN_PASSWORD backend php spark db:seed "$seeder"
        ;;
    shell)
        compose_dev run --rm backend sh
        ;;
    help|-h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/dev.sh <comando>

  up         Inicia el entorno local (construye si hace falta).
  down       Detiene los servicios; NO elimina volúmenes.
  restart    Reinicia los servicios.
  status     Muestra el estado de los contenedores.
  logs       Sigue los logs; puede indicar un servicio: dev.sh logs backend
  build      Reconstruye las imágenes de desarrollo.
  migrate    Aplica migraciones explícitamente.
  seed [x]   Ejecuta SystemSeeder o el seeder indicado (modifica datos).
  shell      Abre una shell en el backend de desarrollo.
  help       Muestra esta ayuda.
USAGE
        ;;
    *) die "Comando desconocido. Ejecute dev.sh help." ;;
esac
