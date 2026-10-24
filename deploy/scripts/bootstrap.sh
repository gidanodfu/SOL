#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

trap 'code=$?; if [ "$code" -ne 0 ]; then
    printf "\nBootstrap detenido (código %s). No se eliminaron volúmenes ni se restauró nada automáticamente.\n" "$code" >&2
    printf "Revise el estado con docker compose -p %s ps y los logs del backend.\n" "$(project_name)" >&2
fi' EXIT

MODE=""
AUTHORIZED=0
for arg in "$@"; do
    case "$arg" in
        --dev) MODE=dev ;;
        --prod) MODE=prod ;;
        --authorize|--yes) AUTHORIZED=1 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/bootstrap.sh <--dev|--prod> --authorize

Inicializa una instalación NUEVA de forma explícita. No se ejecuta desde up,
restart ni deploy.sh.

  --dev         usa el entorno de desarrollo y su proyecto Compose.
  --prod        usa producción; exige CI_ENVIRONMENT=production, un proyecto
                distinto de sol_dev, NGINX_MODE=http, la red exclusiva
                Traefik ↔ SOL y Traefik en ejecución.
  --authorize   confirma que se crearán el administrador inicial y los datos
                base. Sin esta bandera el script no hace cambios.

Requiere INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD en el .env activo.
No imprime contraseñas. Si la base ya contiene usuarios, se detiene.
USAGE
            exit 0
            ;;
        *) die "Opción desconocida: $arg" ;;
    esac
done

[ -n "$MODE" ] || die "Debe seleccionar el entorno: bootstrap.sh --dev --authorize o --prod --authorize."
[ "$AUTHORIZED" = "1" ] || die "Falta autorización expresa: agregue --authorize para crear la instalación inicial."

require_repo
docker_available
validate_env_basics
require_env INITIAL_ADMIN_USERNAME "Defina el usuario administrador inicial."
require_env INITIAL_ADMIN_PASSWORD "Defina la contraseña del administrador inicial."
export_admin_credentials

if [ "$MODE" = "prod" ]; then
    require_prod_project
    [ "$(env_get NGINX_MODE)" = "http" ] || die "Detrás de Traefik, NGINX_MODE debe ser http; el TLS termina en Traefik."
    require_sol_entry_network
    require_traefik_entry
    run_compose() { compose_prod "$@"; }
    compute_cmd=compose_prod
    wait_services="db backend frontend nginx"
else
    require_dev_project
    run_compose() { compose_dev "$@"; }
    compute_cmd=compose_dev
    wait_services="db backend frontend"
fi

assert_compose_project "$compute_cmd"

printf 'Bootstrap de instalación nueva\n'
printf 'Entorno: %s\n' "$MODE"
printf 'Proyecto Compose: %s\n' "$(project_name)"
printf 'No se ejecutará ningún seeder adicional.\n'

printf 'Asegurando base de datos...\n'
run_compose up -d db
wait_for_service "$compute_cmd" db 90

printf 'Comprobando que la base esté vacía...\n'
HAS_USERS=$(run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'users';
SQL
) || die "No se pudo consultar la base de datos."
HAS_USERS=$(printf '%s' "$HAS_USERS" | tr -d '[:space:]')

if [ "${HAS_USERS:-0}" != "0" ]; then
    USER_COUNT=$(run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM users;
SQL
) || die "No se pudo contar los usuarios existentes."
    USER_COUNT=$(printf '%s' "$USER_COUNT" | tr -d '[:space:]')
    if [ "${USER_COUNT:-0}" != "0" ]; then
        die "La base ya contiene usuarios. bootstrap.sh es solo para instalaciones nuevas; use deploy.sh para actualizar."
    fi
fi

printf 'Construyendo imágenes...\n'
run_compose build

printf 'Aplicando migraciones...\n'
run_compose run --rm backend php spark migrate --all

printf 'Ejecutando SystemSeeder con las credenciales iniciales...\n'
run_compose run --rm -e INITIAL_ADMIN_USERNAME -e INITIAL_ADMIN_PASSWORD backend php spark db:seed SystemSeeder

ADMIN_USER=$(env_get INITIAL_ADMIN_USERNAME)
ADMIN_USER_SQL=$(printf '%s' "$ADMIN_USER" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g")
ADMIN_COUNT=$(printf "SELECT COUNT(*) FROM users WHERE username='%s' AND rol='admin' AND estado='activo';\n" "$ADMIN_USER_SQL" | run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"') || die "No se pudo verificar el administrador inicial."
ADMIN_COUNT=$(printf '%s' "$ADMIN_COUNT" | tr -d '[:space:]')
[ "${ADMIN_COUNT:-0}" = "1" ] || die "No se pudo verificar el administrador inicial. Revise los logs del backend."

printf 'Iniciando servicios...\n'
run_compose up -d
for service in $wait_services; do
    wait_for_service "$compute_cmd" "$service" 90
done

if [ "$MODE" = "prod" ]; then
    http_ok "$(nginx_health_url)" || die "La verificación /health de Nginx falló."
else
    http_ok "http://127.0.0.1:$(env_get DEV_API_PORT)/health" || die "La verificación /health del backend falló."
    http_ok "http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)/" || die "El frontend no responde."
fi

printf '\nBootstrap completado correctamente.\n'
printf 'Proyecto: %s\n' "$(project_name)"
printf 'Frontend: %s\n' "$(env_get APP_URL)"
printf 'API:      %s\n' "$(env_get app.baseURL)"
printf 'No se eliminaron volúmenes. Para actualizaciones use deploy.sh.\n'
