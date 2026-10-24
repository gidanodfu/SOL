#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

require_repo
docker_available

uso() {
    cat <<'USAGE'
Uso: deploy/scripts/dev.sh <comando> [argumentos]

Entorno de desarrollo aislado. Todos los comandos de aplicación se ejecutan
dentro de contenedores; no se requiere PHP, Composer, Node.js ni MySQL en el host.

  up                 Inicia el entorno local (construye si hace falta).
  up --no-build      Inicia sin reconstruir imágenes.
  down               Detiene los servicios; NO elimina volúmenes.
  restart            Reinicia los servicios.
  status             Muestra estado y salud de los contenedores.
  logs [servicio]    Sigue los logs (por defecto, todos).
  build              Reconstruye las imágenes de desarrollo.
  shell [servicio]   Abre una shell (por defecto backend).
  exec <svc> <cmd...> Ejecuta un comando en un contenedor en ejecución.
  run <svc> <cmd...>  Ejecuta un comando en un contenedor temporal.
  db                 Abre el cliente MySQL dentro del contenedor db.
  tools              Inicia Adminer opcional en 127.0.0.1:8082.
  test [objetivo]    Ejecuta test.sh (all|backend|frontend|http|smoke|validation).
  validate           Ejecuta validate.sh.
  migrate            Aplica migraciones pendientes en desarrollo.
  migration-status   Consulta el estado de las migraciones.
  seed <seeder> --yes Ejecuta un seeder de pruebas autorizado.
  help               Muestra esta ayuda.

Ejemplos:
  ./deploy/scripts/dev.sh up
  ./deploy/scripts/dev.sh logs backend
  ./deploy/scripts/dev.sh exec backend php spark migrate:status
  ./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
  ./deploy/scripts/dev.sh test http
  ./deploy/scripts/dev.sh test smoke
USAGE
}

case "${1:-help}" in
    up)
        validate_env_basics
        require_dev_project
        if [ "${2:-}" = "--no-build" ]; then
            compose_dev up -d
        else
            compose_dev up -d --build
        fi
        wait_for_service compose_dev db 60
        wait_for_service compose_dev backend 90
        wait_for_service compose_dev frontend 60
        printf 'SOL desarrollo: %s\n' "$(env_get APP_URL)"
        printf 'Proyecto Compose: %s\n' "$(project_name)"
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
    shell)
        servicio="${2:-backend}"
        compose_dev exec "$servicio" sh
        ;;
    exec)
        shift
        [ "$#" -ge 2 ] || die "Uso: dev.sh exec <servicio> <comando...>"
        servicio="$1"
        shift
        compose_dev exec "$servicio" "$@"
        ;;
    run)
        shift
        [ "$#" -ge 2 ] || die "Uso: dev.sh run <servicio> <comando...>"
        servicio="$1"
        shift
        compose_dev run --rm "$servicio" "$@"
        ;;
    db)
        compose_dev exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
        ;;
    tools)
        compose_dev --profile tools up -d adminer
        printf 'Adminer opcional: http://127.0.0.1:%s\n' "$(env_get DEV_ADMINER_PORT)"
        ;;
    test)
        objetivo="${2:-all}"
        "$ROOT/deploy/scripts/test.sh" "$objetivo"
        ;;
    validate)
        "$ROOT/deploy/scripts/validate.sh" --dev
        ;;
    migrate)
        validate_env_basics
        require_dev_project
        compose_dev run --rm backend php spark migrate --all
        ;;
    migration-status)
        validate_env_basics
        require_dev_project
        compose_dev run --rm --no-deps backend php spark migrate:status
        ;;
    seed)
        seeder="${2:-}"
        autorizacion="${3:-}"
        [ -n "$seeder" ] || die "Indique un seeder. Ejemplo: dev.sh seed DatosPruebaSeeder --yes"
        [ "$autorizacion" = "--yes" ] || die "Los seeders modifican datos. Repita el comando con --yes tras revisar el entorno."
        case "$seeder" in
            DatosPruebaSeeder|DatosMasivosSeeder) ;;
            SystemSeeder) die "SystemSeeder solo se ejecuta mediante bootstrap.sh con autorización explícita." ;;
            *) die "Seeder no permitido desde dev.sh: $seeder" ;;
        esac
        validate_env_basics
        require_dev_project
        printf 'Ejecutando %s en el proyecto %s (modifica datos de desarrollo).\n' "$seeder" "$(project_name)"
        compose_dev run --rm backend php spark db:seed "$seeder"
        ;;
    help|-h|--help)
        uso
        ;;
    *)
        die "Comando desconocido. Ejecute dev.sh help."
        ;;
esac
