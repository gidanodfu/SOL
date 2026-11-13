#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Compara una instalación MySQL 8.0.46 con MariaDB 11.4.13 usando bases
# temporales en tmpfs. No usa volúmenes ni credenciales reales.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")/../.." && pwd)
. "$ROOT/.github/scripts/docker-retry.sh"
NET="sol_compat_$$"
MY="sol_compat_mysql_$$"
MA="sol_compat_mariadb_$$"
IMG="sol_backend_test:local"
DB="sistema_empleo"
ROOTPW="compat-root-$$-0123456789"
USERPW="compat-user-$$-0123456789"
READY_TIMEOUT=${COMPAT_READY_TIMEOUT:-120}
ARTIFACTS=${COMPAT_ARTIFACTS:-"$(mktemp -d "${TMPDIR:-/tmp}/sol-compat.XXXXXX")"}

mkdir -p "$ARTIFACTS"

cleanup() {
    docker rm -f "$MY" "$MA" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

command -v docker >/dev/null 2>&1 || {
    echo "ERROR: Docker no está disponible." >&2
    exit 2
}

guardar_evidencias() {
    local nombre=$1
    local contenedor=$2
    local inspect="$ARTIFACTS/${nombre}-container-inspect.json"

    {
        printf '{"image":'
        docker inspect --format '{{json .Config.Image}}' "$contenedor" 2>/dev/null || printf 'null'
        printf ',"state":'
        docker inspect --format '{{json .State}}' "$contenedor" 2>/dev/null || printf 'null'
        printf ',"tmpfs":'
        docker inspect --format '{{json .HostConfig.Tmpfs}}' "$contenedor" 2>/dev/null || printf 'null'
        printf '}\n'
    } > "$inspect"
    docker logs "$contenedor" > "$ARTIFACTS/${nombre}-container.log" 2>&1 || true
}

esperar_motor() {
    local nombre=$1
    local cliente=$2
    local contenedor=$3
    local log="$ARTIFACTS/${nombre}-startup.log"
    local error="$ARTIFACTS/${nombre}-last-error.log"
    local inicio
    local intento=1
    local estado
    local version

    inicio=$(date +%s)
    : > "$log"
    printf 'Esperando %s (%s) con protocolo TCP...\n' "$nombre" "$contenedor" >> "$log"

    while [ "$intento" -le "$READY_TIMEOUT" ]; do
        estado=$(docker inspect --format '{{.State.Status}}' "$contenedor" 2>/dev/null || true)
        if [ -z "$estado" ]; then
            printf 'Intento %s/%s: el contenedor %s no existe.\n' "$intento" "$READY_TIMEOUT" "$contenedor" | tee -a "$log"
            guardar_evidencias "$nombre" "$contenedor"
            return 1
        fi
        if [ "$estado" != "running" ]; then
            printf 'Intento %s/%s: el contenedor %s está en estado %s.\n' "$intento" "$READY_TIMEOUT" "$contenedor" "$estado" | tee -a "$log"
            guardar_evidencias "$nombre" "$contenedor"
            return 1
        fi

        if docker exec -e MYSQL_PWD="$ROOTPW" "$contenedor" \
            "$cliente" --protocol=TCP -h127.0.0.1 -uroot -N -e 'SELECT 1' \
            >/dev/null 2>"$error"; then
            version=$(docker exec -e MYSQL_PWD="$ROOTPW" "$contenedor" \
                "$cliente" --protocol=TCP -h127.0.0.1 -uroot -N -e 'SELECT VERSION()' 2>/dev/null)
            printf 'Listo tras %ss. Versión: %s\n' "$(( $(date +%s) - inicio ))" "$version" | tee -a "$log"
            rm -f "$error"
            guardar_evidencias "$nombre" "$contenedor"
            return 0
        fi

        if grep -qi 'Access denied' "$error" 2>/dev/null; then
            printf 'Intento %s/%s: autenticación rechazada por %s.\n' "$intento" "$READY_TIMEOUT" "$nombre" | tee -a "$log"
            guardar_evidencias "$nombre" "$contenedor"
            return 1
        fi
        if [ "$intento" -eq 1 ] || [ $((intento % 10)) -eq 0 ]; then
            printf 'Intento %s/%s: todavía no acepta consultas (%s).\n' \
                "$intento" "$READY_TIMEOUT" "$(tail -n 1 "$error" 2>/dev/null || true)" | tee -a "$log"
        fi
        sleep 1
        intento=$((intento + 1))
    done

    printf 'ERROR: %s no aceptó consultas TCP en %ss.\n' "$nombre" "$READY_TIMEOUT" | tee -a "$log"
    guardar_evidencias "$nombre" "$contenedor"
    return 1
}

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
    echo "Construyendo imagen de pruebas..."
    docker_retry docker build --target test -t "$IMG" -f "$ROOT/backend/Dockerfile" "$ROOT" >/dev/null
fi

docker network create "$NET" >/dev/null

echo "== MySQL 8.0.46 temporal =="
docker_retry docker run -d --name "$MY" --network "$NET" \
    -e MYSQL_ROOT_PASSWORD="$ROOTPW" -e MYSQL_DATABASE="$DB" \
    --tmpfs /var/lib/mysql:rw mysql:8.0.46 >/dev/null
esperar_motor mysql mysql "$MY"

run_backend() {
    local host=$1; shift
    docker run --rm --network "$NET" \
        -e CI_ENVIRONMENT=development -e DB_HOST="$host" -e DB_PORT=3306 \
        -e DB_DATABASE="$DB" -e DB_USER=root -e DB_PASSWORD="$ROOTPW" -e DB_DRIVER=MySQLi \
        -e jwt.secret=compat-jwt-0123456789abcdef0123456789abcdef \
        -e INITIAL_ADMIN_USERNAME=ci-admin -e INITIAL_ADMIN_PASSWORD=CiAdmin123! \
        -e storage.driver=local -e turnstile.enabled=false -e TZ=America/Lima \
        "$IMG" "$@"
}

echo "== Esquema y datos sintéticos en MySQL =="
run_backend "$MY" php spark migrate --all >/dev/null
run_backend "$MY" php spark db:seed SystemSeeder >/dev/null
run_backend "$MY" php spark db:seed DatosPruebaSeeder >/dev/null

DUMP="$ARTIFACTS/mysql-data.sql"
docker exec -e MYSQL_PWD="$ROOTPW" "$MY" mysqldump -uroot \
    --single-transaction --quick --no-create-info --skip-triggers --skip-routines \
    --default-character-set=utf8mb4 --ignore-table="$DB.migrations" "$DB" > "$DUMP"
test -s "$DUMP"
grep -q '^CREATE TABLE' "$DUMP" && {
    echo "ERROR: el dump contiene DDL." >&2
    exit 1
}

echo "== MariaDB 11.4.13 temporal =="
docker_retry docker run -d --name "$MA" --network "$NET" \
    -e MARIADB_ROOT_PASSWORD="$ROOTPW" -e MARIADB_DATABASE="$DB" \
    --tmpfs /var/lib/mysql:rw mariadb:11.4.13 >/dev/null
esperar_motor mariadb mariadb "$MA"

run_backend "$MA" php spark migrate --all >/dev/null
{ echo "SET FOREIGN_KEY_CHECKS=0;"; cat "$DUMP"; echo "SET FOREIGN_KEY_CHECKS=1;"; } | \
    docker exec -i -e MYSQL_PWD="$ROOTPW" "$MA" mariadb -uroot "$DB"

echo "== Comparación determinista =="
docker run --rm --network "$NET" \
    -e SRC_DB_HOST="$MY" -e SRC_DB_PORT=3306 -e SRC_DB_DATABASE="$DB" \
    -e SRC_DB_USER=root -e SRC_DB_PASSWORD="$ROOTPW" \
    -e DST_DB_HOST="$MA" -e DST_DB_PORT=3306 -e DST_DB_DATABASE="$DB" \
    -e DST_DB_USER=root -e DST_DB_PASSWORD="$ROOTPW" \
    -e COMPARE_BATCH=500 \
    -e COMPARE_JSON_OUT=/reports/comparison.json \
    -e COMPARE_MD_OUT=/reports/comparison.md \
    -v "$ROOT/tests:/var/www/sol/tests:ro" -v "$ARTIFACTS:/reports" \
    "$IMG" php /var/www/sol/tests/tools/compare_database_data.php

echo "== Auditoría de integridad MariaDB =="
docker run --rm --network "$NET" \
    -e DB_HOST="$MA" -e DB_PORT=3306 -e DB_DATABASE="$DB" \
    -e DB_USER=root -e DB_PASSWORD="$ROOTPW" \
    -v "$ROOT/tests:/var/www/sol/tests:ro" -v "$ARTIFACTS:/reports" \
    "$IMG" php /var/www/sol/tests/tools/audit_database_integrity.php --json=/reports/audit.json

echo "Compatibilidad MySQL -> MariaDB: OK"
echo "Evidencias: $ARTIFACTS"
