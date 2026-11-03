#!/bin/sh
set -eu
umask 077

. "$(dirname -- "$0")/lib/common.sh"

trap 'code=$?; if [ "$code" -ne 0 ]; then
    printf "\nRestauración detenida (código %s). No se inició una restauración automática de recuperación.\n" "$code" >&2
    printf "Conserve el respaldo de seguridad y revise el estado de los servicios antes de reintentar.\n" >&2
fi' EXIT

TARGET=""
DB_FILE=""
FILES_FILE=""
CONFIRM=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        --env) [ "$#" -ge 2 ] || die "Falta el valor de --env."; TARGET=$2; shift 2 ;;
        --db) [ "$#" -ge 2 ] || die "Falta el valor de --db."; DB_FILE=$2; shift 2 ;;
        --files) [ "$#" -ge 2 ] || die "Falta el valor de --files."; FILES_FILE=$2; shift 2 ;;
        --confirm) [ "$#" -ge 2 ] || die "Falta el valor de --confirm."; CONFIRM=$2; shift 2 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/restore.sh --env dev --db <archivo.sql> \
       [--files <archivo.tar.gz>] --confirm "RESTORE:<proyecto>:dev"

Restaura la base de desarrollo y, opcionalmente, el volumen writable. Es una
operación destructiva: sobrescribe la base local. Crea un respaldo de seguridad
antes de restaurar, detiene la aplicación y no borra volúmenes.
USAGE
            exit 0
            ;;
        *) die "Opción desconocida: $1" ;;
    esac
done

[ "$TARGET" = "dev" ] || die "Debe indicar --env dev."
[ -n "$DB_FILE" ] || die "Debe indicar --db con el archivo SQL del respaldo."
[ -f "$DB_FILE" ] && [ -r "$DB_FILE" ] || die "No se puede leer el respaldo SQL: $DB_FILE"
[ -s "$DB_FILE" ] || die "El respaldo SQL está vacío."

require_repo
require_env_file
docker_available
if [ -n "$FILES_FILE" ]; then
    [ -f "$FILES_FILE" ] && [ -r "$FILES_FILE" ] || die "No se puede leer el respaldo de archivos: $FILES_FILE"
    docker run --rm -v "$(CDPATH= cd -- "$(dirname -- "$FILES_FILE")" && pwd):/backup:ro" alpine:3.21 \
        tar -tzf "/backup/$(basename "$FILES_FILE")" >/dev/null || die "El respaldo de archivos no es un tar.gz válido."
fi

validate_env_basics
require_dev_project
assert_compose_project compose_dev

EXPECTED_CONFIRM="RESTORE:$(project_name):dev"
[ "$CONFIRM" = "$EXPECTED_CONFIRM" ] || die "Confirmación incorrecta. Use exactamente: --confirm '$EXPECTED_CONFIRM'"

printf 'Restauración solicitada\n'
printf 'Entorno: desarrollo\n'
printf 'Proyecto Compose: %s\n' "$(project_name)"
printf 'Base de datos: %s\n' "$(env_get DB_DATABASE)"
[ -n "$FILES_FILE" ] && printf 'Archivos: %s\n' "$FILES_FILE"

printf 'Asegurando base de datos y creando respaldo de seguridad...\n'
compose_dev up -d db
wait_for_service compose_dev db 90
"$ROOT/deploy/scripts/backup.sh" dev

printf 'Deteniendo servicios de aplicación (sin tocar el volumen)...\n'
compose_dev stop backend frontend 2>/dev/null || true

printf 'Restaurando base de datos...\n'
compose_dev exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"' < "$DB_FILE"

TABLE_COUNT=$(compose_dev exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();
SQL
) || die "No se pudo verificar la estructura restaurada."
[ "${TABLE_COUNT:-0}" -gt 0 ] || die "La restauración no dejó tablas en la base de destino."
USER_COUNT=$(compose_dev exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*) FROM users;
SQL
) || die "No se pudo verificar la tabla users después de restaurar."
printf 'Verificación: %s tablas, %s usuarios.\n' "$TABLE_COUNT" "${USER_COUNT:-0}"

if [ -n "$FILES_FILE" ]; then
    VOL=$(volume_name backend_writable)
    docker volume inspect "$VOL" >/dev/null 2>&1 || die "No existe el volumen $VOL; no se restauraron archivos."
    printf 'Restaurando archivos en %s...\n' "$VOL"
    docker run --rm \
        -v "$VOL:/dest" \
        -v "$(CDPATH= cd -- "$(dirname -- "$FILES_FILE")" && pwd):/backup:ro" \
        alpine:3.21 sh -c 'tar xzf "/backup/$(basename "$FILES_FILE")" -C /dest'
    printf 'Archivos restaurados. Los archivos no presentes en el respaldo no se eliminan.\n'
fi

printf 'Iniciando servicios...\n'
compose_dev up -d
for service in db backend frontend; do
    wait_for_service compose_dev "$service" 90
done

http_ok "http://127.0.0.1:$(env_get DEV_API_PORT)/health" || die "La verificación /health del backend falló."
http_ok "http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)/" || die "El frontend no responde."

printf '\nRestauración completada.\n'
printf 'Proyecto: %s\n' "$(project_name)"
printf 'Verifique conteos, relaciones y acceso funcional.\n'
