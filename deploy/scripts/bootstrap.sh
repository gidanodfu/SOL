#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

trap 'code=$?; if [ "$code" -ne 0 ]; then
    printf "\nBootstrap detenido (código %s). No se eliminaron volúmenes ni se restauró nada automáticamente.\n" "$code" >&2
    printf "Revise el estado con docker compose -p %s ps y los logs del backend.\n" "$(project_name)" >&2
fi' EXIT

AUTHORIZED=0
for arg in "$@"; do
    case "$arg" in
        --dev) ;;
        --authorize|--yes) AUTHORIZED=1 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/bootstrap.sh --dev --authorize

Inicializa una instalación NUEVA de desarrollo de forma explícita. No se
ejecuta desde up, restart ni dev.sh.

  --dev         entorno de desarrollo (único entorno soportado).
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

[ "$AUTHORIZED" = "1" ] || die "Falta autorización expresa: agregue --authorize para crear la instalación inicial."

require_repo
docker_available
validate_env_basics
require_dev_project
require_env INITIAL_ADMIN_USERNAME "Defina el usuario administrador inicial."
require_env INITIAL_ADMIN_PASSWORD "Defina la contraseña del administrador inicial."
export_admin_credentials

assert_compose_project compose_dev

printf 'Bootstrap de instalación nueva\n'
printf 'Entorno: desarrollo\n'
printf 'Proyecto Compose: %s\n' "$(project_name)"
printf 'No se ejecutará ningún seeder adicional.\n'

printf 'Asegurando base de datos...\n'
compose_dev up -d db
wait_for_service compose_dev db 90

printf 'Comprobando que la base esté vacía...\n'
HAS_USERS=$(compose_dev exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot -N "$MARIADB_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'users';
SQL
) || die "No se pudo consultar la base de datos."
HAS_USERS=$(printf '%s' "$HAS_USERS" | tr -d '[:space:]')

if [ "${HAS_USERS:-0}" != "0" ]; then
    USER_COUNT=$(compose_dev exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot -N "$MARIADB_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM users;
SQL
) || die "No se pudo contar los usuarios existentes."
    USER_COUNT=$(printf '%s' "$USER_COUNT" | tr -d '[:space:]')
    if [ "${USER_COUNT:-0}" != "0" ]; then
        die "La base ya contiene usuarios. bootstrap.sh es solo para instalaciones nuevas; use dev.sh migrate para actualizar."
    fi
fi

printf 'Construyendo imágenes...\n'
compose_dev build

printf 'Aplicando migraciones...\n'
compose_dev run --rm backend php spark migrate --all

printf 'Ejecutando SystemSeeder con las credenciales iniciales...\n'
compose_dev run --rm -e INITIAL_ADMIN_USERNAME -e INITIAL_ADMIN_PASSWORD backend php spark db:seed SystemSeeder

ADMIN_USER=$(env_get INITIAL_ADMIN_USERNAME)
ADMIN_USER_SQL=$(printf '%s' "$ADMIN_USER" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g")
ADMIN_COUNT=$(printf "SELECT COUNT(*) FROM users WHERE username='%s' AND rol='admin' AND estado='activo';\n" "$ADMIN_USER_SQL" | compose_dev exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot -N "$MARIADB_DATABASE"') || die "No se pudo verificar el administrador inicial."
ADMIN_COUNT=$(printf '%s' "$ADMIN_COUNT" | tr -d '[:space:]')
[ "${ADMIN_COUNT:-0}" = "1" ] || die "No se pudo verificar el administrador inicial. Revise los logs del backend."

printf 'Iniciando servicios...\n'
compose_dev up -d
for service in db backend frontend; do
    wait_for_service compose_dev "$service" 90
done

dev_health compose_dev backend http://127.0.0.1:8080/health || die "La verificación /health del backend falló."
dev_health compose_dev frontend http://127.0.0.1:5173/ || die "El frontend no responde."

printf '\nBootstrap completado correctamente.\n'
printf 'Proyecto: %s\n' "$(project_name)"
printf 'Frontend: %s\n' "$(env_get APP_URL)"
printf 'API:      %s\n' "$(env_get app.baseURL)"
printf 'No se eliminaron volúmenes.\n'
