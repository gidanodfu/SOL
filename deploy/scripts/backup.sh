#!/bin/sh
set -eu
umask 077

. "$(dirname -- "$0")/lib/common.sh"

TARGET="${1:-}"
case "$TARGET" in
    dev) compose_cmd=compose_dev ;;
    prod) compose_cmd=compose_prod ;;
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/backup.sh <dev|prod>

Genera un respaldo fechado de MySQL y del volumen writable del backend.
El destino por defecto es $HOME/sol-backups; puede cambiarse con BACKUP_DIR.
No elimina respaldos anteriores ni volúmenes. Los archivos quedan con permisos
600 y se verifica que no estén vacíos. No imprime secretos.
USAGE
        exit 0
        ;;
    *) die "Entorno inválido: ${TARGET:-vacío} (use dev o prod)" ;;
esac

require_repo
require_env_file
docker_available
validate_env_basics
if [ "$TARGET" = "prod" ]; then
    require_prod_project
else
    require_dev_project
fi
assert_compose_project "$compose_cmd"
require_service_running "$compose_cmd" db

BACKUP_DIR=${BACKUP_DIR:-"$HOME/sol-backups"}
case "$BACKUP_DIR" in
    /*) ;;
    *) BACKUP_DIR="$PWD/$BACKUP_DIR" ;;
esac
case "$BACKUP_DIR" in
    "$ROOT"/*) die "BACKUP_DIR no puede estar dentro del repositorio." ;;
esac
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
DB_FILE="$BACKUP_DIR/sol-db-$STAMP.sql"
WRITE_FILE="$BACKUP_DIR/sol-writable-$STAMP.tar.gz"
MANIFEST="$BACKUP_DIR/sol-backup-$STAMP.txt"
[ ! -e "$DB_FILE" ] || die "El respaldo $DB_FILE ya existe; no se sobrescribe."
[ ! -e "$WRITE_FILE" ] || die "El respaldo $WRITE_FILE ya existe; no se sobrescribe."
[ ! -e "$MANIFEST" ] || die "El manifiesto $MANIFEST ya existe; no se sobrescribe."

printf 'Creando respaldo de MySQL...\n'
$compose_cmd exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"' > "$DB_FILE"
[ -s "$DB_FILE" ] || die "El respaldo de MySQL quedó vacío."
grep -q '^CREATE TABLE' "$DB_FILE" || die "El respaldo de MySQL no contiene tablas; no se considera válido."
chmod 600 "$DB_FILE"

VOL=$(volume_name backend_writable)
if docker volume inspect "$VOL" >/dev/null 2>&1; then
    printf 'Respaldando writable/...\n'
    # Se escribe el tar por stdout para que el archivo pertenezca al usuario
    # que ejecuta el script, no a root del contenedor.
    docker run --rm -v "$VOL:/data:ro" alpine:3.21 tar czf - -C /data . > "$WRITE_FILE"
    [ -s "$WRITE_FILE" ] || die "El respaldo de writable quedó vacío."
    docker run --rm -v "$BACKUP_DIR:/backup:ro" alpine:3.21 tar -tzf "/backup/$(basename "$WRITE_FILE")" >/dev/null \
        || die "El archivo writable no se pudo verificar."
    chmod 600 "$WRITE_FILE"
else
    WRITE_FILE=""
    warn "No existe el volumen $VOL; se omite writable."
fi

if command -v sha256sum >/dev/null 2>&1; then
    DB_SHA=$(sha256sum "$DB_FILE" | awk '{print $1}')
    WRITE_SHA=$([ -n "$WRITE_FILE" ] && sha256sum "$WRITE_FILE" | awk '{print $1}' || printf 'omitido')
elif command -v shasum >/dev/null 2>&1; then
    DB_SHA=$(shasum -a 256 "$DB_FILE" | awk '{print $1}')
    WRITE_SHA=$([ -n "$WRITE_FILE" ] && shasum -a 256 "$WRITE_FILE" | awk '{print $1}' || printf 'omitido')
else
    DB_SHA=$(docker run --rm -v "$BACKUP_DIR:/backup:ro" alpine:3.21 sha256sum "/backup/$(basename "$DB_FILE")" | awk '{print $1}')
    WRITE_SHA=$([ -n "$WRITE_FILE" ] && docker run --rm -v "$BACKUP_DIR:/backup:ro" alpine:3.21 sha256sum "/backup/$(basename "$WRITE_FILE")" | awk '{print $1}' || printf 'omitido')
fi

{
    printf 'SOL backup\n'
    printf 'fecha=%s\n' "$(date -Iseconds 2>/dev/null || date)"
    printf 'entorno=%s\n' "$TARGET"
    printf 'proyecto=%s\n' "$(project_name)"
    printf 'base=%s\n' "$(env_get DB_DATABASE)"
    printf 'db_file=%s\n' "$(basename "$DB_FILE")"
    printf 'db_sha256=%s\n' "$DB_SHA"
    if [ -n "$WRITE_FILE" ]; then
        printf 'writable_file=%s\n' "$(basename "$WRITE_FILE")"
        printf 'writable_sha256=%s\n' "$WRITE_SHA"
    else
        printf 'writable_file=omitido\n'
    fi
} > "$MANIFEST"
chmod 600 "$MANIFEST"

printf 'Respaldo de base de datos: %s\n' "$DB_FILE"
[ -n "$WRITE_FILE" ] && printf 'Respaldo writable: %s\n' "$WRITE_FILE"
printf 'Manifiesto: %s\n' "$MANIFEST"
printf 'Conserve estos archivos fuera del repositorio y con permisos restringidos.\n'
