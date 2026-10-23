#!/bin/sh
set -eu
umask 077

. "$(dirname -- "$0")/lib/common.sh"

TARGET="${1:-dev}"
case "$TARGET" in
    dev) compose_cmd=compose_dev ;;
    prod) compose_cmd=compose_prod ;;
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/backup.sh [dev|prod]

Genera un respaldo fechado de MySQL y del volumen writable del backend.
El destino por defecto es $HOME/sol-backups; puede cambiarse con BACKUP_DIR.
No elimina respaldos anteriores ni volumes.
USAGE
        exit 0
        ;;
    *) die "Entorno inválido: $TARGET (use dev o prod)" ;;
esac

require_repo
require_env_file
docker_available

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
[ ! -e "$DB_FILE" ] || die "El respaldo $DB_FILE ya existe; no se sobrescribe."

printf 'Creando respaldo de MySQL...\n'
$compose_cmd exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"' > "$DB_FILE"
[ -s "$DB_FILE" ] || die "El respaldo de MySQL quedó vacío."
chmod 600 "$DB_FILE"

VOL=$(volume_name backend_writable)
if docker volume inspect "$VOL" >/dev/null 2>&1; then
    printf 'Respaldando writable/...\n'
    WRITE_FILE="$BACKUP_DIR/sol-writable-$STAMP.tar.gz"
    [ ! -e "$WRITE_FILE" ] || die "El respaldo $WRITE_FILE ya existe; no se sobrescribe."
    # Se escribe el tar por stdout para que el archivo pertenezca al usuario
    # que ejecuta el script, no a root del contenedor.
    docker run --rm -v "$VOL:/data:ro" alpine tar czf - -C /data . > "$WRITE_FILE"
    [ -s "$WRITE_FILE" ] || die "El respaldo de writable quedó vacío."
    chmod 600 "$WRITE_FILE"
    printf 'Writable: %s\n' "$WRITE_FILE"
else
    warn "No existe el volumen $VOL; se omite writable."
fi

printf 'Respaldo de base de datos: %s\n' "$DB_FILE"
printf 'Conserve estos archivos fuera del repositorio y con permisos restringidos.\n'
