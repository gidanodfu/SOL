#!/bin/sh
set -eu
umask 077

. "$(dirname -- "$0")/lib/common.sh"

# Ejecuta los smoke tests dentro de Docker, con un MySQL temporal en tmpfs,
# un esquema aislado por suite y sin publicar puertos. No usa PHP, Python, curl
# ni MySQL instalados en el host; solo Docker y utilidades POSIX mínimas.
TEST_IMAGE=sol_backend_test:local
NET=""
DB_CONTAINER=""
TEST_ENV=""
BUILD_LOG=""
FAILED=0
SUITES=0
FAILED_SUITES=0
ASSERT_FAILURES=0
CURRENT_DB=""

cleanup() {
    [ -n "$DB_CONTAINER" ] && docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
    [ -n "$NET" ] && docker network rm "$NET" >/dev/null 2>&1 || true
    [ -n "$TEST_ENV" ] && rm -f "$TEST_ENV"
    [ -n "$BUILD_LOG" ] && rm -f "$BUILD_LOG"
    return 0
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

case "${1:-}" in
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/smoke.sh [test_api.sh test_seguridad.sh ...]

Ejecuta los smoke tests en un backend Docker efímero contra un MySQL temporal
en tmpfs. Cada suite recibe un esquema propio con migraciones y fixtures
explícitos; el runner agrega fallos y devuelve código distinto de cero si
alguna aserción o respuesta falla. No toca `sol_dev_*`, no usa la base de
desarrollo y no publica puertos.

Sin argumentos ejecuta la lista segura (excluye test_desarrollo_nuevo.sh porque
depende de SUNAT y de un RUC real). Requiere `dev.sh build` o construye la
imagen de pruebas automáticamente.
USAGE
        exit 0
        ;;
esac

require_repo
docker_available

if [ "$#" -gt 0 ]; then
    TESTS="$*"
else
    TESTS="test_api.sh test_ofertas.sh test_aprobacion_ofertas.sh test_ofertas_campos.sh test_reglas_ofertas.sh test_retiro_postulacion.sh test_concurrencia.sh test_fase3.sh test_fase4.sh test_fase5.sh test_fase6.sh test_seguridad.sh test_rte.sh test_identidad.sh test_reporte_empresa.sh test_reporte_ofertas.sh test_reporte_pdf.sh test_perfiles_municipales.sh test_unicidad_municipal.sh test_actividades_obligatorias.sh test_cv.sh"
fi

for test in $TESTS; do
    case "$test" in
        test_desarrollo_nuevo.sh)
            die "test_desarrollo_nuevo.sh requiere SUNAT/RUC real; ejecútelo manualmente con credenciales autorizadas."
            ;;
        test_docker_http.sh)
            die "test_docker_http.sh se ejecuta con test.sh http contra el stack de desarrollo."
            ;;
    esac
    [ -f "$ROOT/tests/smoke/$test" ] || die "No existe tests/smoke/$test."
done

BUILD_LOG=$(mktemp "${TMPDIR:-/tmp}/sol-smoke-build.XXXXXX")
printf 'Construyendo imagen de pruebas (solo Docker)...\n'
if ! docker build --target test -t "$TEST_IMAGE" -f "$ROOT/backend/Dockerfile" "$ROOT" >"$BUILD_LOG" 2>&1; then
    tail -40 "$BUILD_LOG" >&2 || true
    die "No se pudo construir la imagen de pruebas."
fi

NET="sol_smoke_$$_$(date +%s)"
DB_CONTAINER="sol_smoke_db_$$"
ROOT_PW="root$(date +%s)$$"
DB_PW="smoke$(date +%s)$$"
JWT_SECRET="smoke-$(date +%s)-$$-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

printf 'Creando MySQL temporal aislado (sin volúmenes persistentes)...\n'
docker network create "$NET" >/dev/null
docker run -d --rm --name "$DB_CONTAINER" --network "$NET" \
    --tmpfs /var/lib/mysql:rw \
    -e MYSQL_ROOT_PASSWORD="$ROOT_PW" \
    -e MYSQL_DATABASE=sistema_empleo \
    -e MYSQL_USER=smoke \
    -e MYSQL_PASSWORD="$DB_PW" \
    -e TZ=America/Lima \
    mysql:8.0.46 >/dev/null

i=0
while [ "$i" -lt 60 ]; do
    if docker exec -e MYSQL_PWD="$ROOT_PW" "$DB_CONTAINER" mysql -uroot -N -e 'SELECT 1' >/dev/null 2>&1; then
        break
    fi
    sleep 2
    i=$((i + 1))
done
docker exec -e MYSQL_PWD="$ROOT_PW" "$DB_CONTAINER" mysql -uroot -N -e 'SELECT 1' >/dev/null 2>&1 \
    || die "MySQL temporal no quedó disponible."

TEST_ENV=$(mktemp "${TMPDIR:-/tmp}/sol-smoke-env.XXXXXX")
chmod 600 "$TEST_ENV"
cat > "$TEST_ENV" <<EOF
CI_ENVIRONMENT=development
DB_HOST=$DB_CONTAINER
DB_PORT=3306
DB_DATABASE=sistema_empleo
DB_USER=smoke
DB_PASSWORD=$DB_PW
DB_DRIVER=MySQLi
APP_URL=http://127.0.0.1:8080
app.baseURL=http://127.0.0.1:8080/
jwt.secret=$JWT_SECRET
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=Admin123!
storage.driver=local
turnstile.enabled=false
TZ=America/Lima
EOF

run_test() {
    db="${CURRENT_DB:-sistema_empleo}"
    docker run --rm --network "$NET" --env-file "$TEST_ENV" \
        -e "DB_DATABASE=$db" \
        -v "$ROOT/tests:/var/www/sol/tests:ro" \
        "$TEST_IMAGE" "$@"
}

create_schema() {
    db=$1
    docker exec -e MYSQL_PWD="$ROOT_PW" "$DB_CONTAINER" mysql -uroot \
        -e "CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`$db\`.* TO 'smoke'@'%'; FLUSH PRIVILEGES;" \
        >/dev/null 2>&1
}

prepare_suite_db() {
    CURRENT_DB=$1
    create_schema "$CURRENT_DB" || return 1
    run_test php spark migrate --all >/dev/null || return 1
    run_test php spark db:seed SystemSeeder >/dev/null || return 1
    run_test php spark db:seed DatosPruebaSeeder >/dev/null || return 1
}

redact_output() {
    sed -E 's/(access_token|refresh_token)([^A-Za-z0-9]+)[A-Za-z0-9._~-]+/\1\2<redacted>/g' "$1"
}

for test in $TESTS; do
    SUITES=$((SUITES + 1))
    safe=$(printf '%s' "${test%.sh}" | tr -c 'A-Za-z0-9_' '_')
    suite_db="sol_smoke_${safe}_$$_$(date +%s)"
    printf '\n== %s ==\n' "$test"
    # Cada suite recibe su propio esquema MySQL dentro del contenedor temporal.
    # Así no depende de IDs, empresas ni usuarios de otra suite.
    if ! prepare_suite_db "$suite_db"; then
        printf 'FAIL %s (no se pudo preparar el esquema aislado)\n' "$test"
        FAILED=1
        FAILED_SUITES=$((FAILED_SUITES + 1))
        ASSERT_FAILURES=$((ASSERT_FAILURES + 1))
        continue
    fi
    OUT=$(mktemp "${TMPDIR:-/tmp}/sol-smoke-test.XXXXXX")
    if run_test bash "/var/www/sol/tests/smoke/$test" >"$OUT" 2>&1; then
        code=0
    else
        code=$?
    fi
    markers=$(grep -Ec 'Traceback \(most recent call last\)|^FAIL|^FALTA|^KeyError|JSONDecodeError|BadZipFile|AssertionError' "$OUT" || true)
    MISMATCH=$(mktemp "${TMPDIR:-/tmp}/sol-smoke-status.XXXXXX")
    sed -nE 's/.*http:([0-9]+) \((esperado )?([0-9]+)\).*/\1 \3/p' "$OUT" > "$MISMATCH"
    mismatch_count=0
    while read -r actual expected; do
        [ -n "$actual" ] || continue
        if [ "$actual" != "$expected" ]; then
            printf 'FAIL estado HTTP %s (esperado %s) en %s\n' "$actual" "$expected" "$test"
            mismatch_count=$((mismatch_count + 1))
        fi
    done < "$MISMATCH"
    rm -f "$MISMATCH"
    redact_output "$OUT"
    if [ "$code" -ne 0 ] || [ "$markers" -gt 0 ] || [ "$mismatch_count" -gt 0 ]; then
        printf 'FAIL %s (exit %s, marcadores: %s, estados: %s)\n' "$test" "$code" "$markers" "$mismatch_count"
        FAILED=1
        FAILED_SUITES=$((FAILED_SUITES + 1))
        ASSERT_FAILURES=$((ASSERT_FAILURES + markers + mismatch_count + 1))
    else
        printf 'OK   %s\n' "$test"
    fi
    rm -f "$OUT"
done

if [ "$FAILED" -ne 0 ]; then
    printf '\nRESUMEN SMOKE\n' >&2
    printf 'Suites ejecutadas: %s\n' "$SUITES" >&2
    printf 'Suites con fallo: %s\n' "$FAILED_SUITES" >&2
    printf 'Marcadores de aserción/error: %s\n' "$ASSERT_FAILURES" >&2
    printf 'Smoke tests con fallos. La base temporal será eliminada.\n' >&2
    exit 1
fi
printf '\nRESUMEN SMOKE\n'
printf 'Suites ejecutadas: %s\n' "$SUITES"
printf 'Suites con fallo: %s\n' "$FAILED_SUITES"
printf 'Marcadores de aserción/error: %s\n' "$ASSERT_FAILURES"
printf 'Smoke tests completados correctamente. La base temporal fue eliminada.\n'
