#!/bin/sh
# Pruebas de validación preventiva, sin leer el .env real ni usar secretos.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/sol-validation-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

pass=0
fail=0

base="$TMP/base.env"
cat > "$base" <<'EOF'
CI_ENVIRONMENT=production
COMPOSE_PROJECT_NAME=sol_prod_validation
APP_DOMAIN=ufe.a-415.win
API_DOMAIN=ufe.a-415.win
APP_URL=https://ufe.a-415.win
app.baseURL=https://ufe.a-415.win/
cors.allowedOrigins=https://ufe.a-415.win
VITE_API_URL=
NGINX_MODE=http
SOL_ENTRY_NETWORK=sol_entry
TRAEFIK_ENTRY_IP=172.31.0.2
DB_PORT=3306
DB_DATABASE=sol_validation
DB_USER=sol_validation
DB_PASSWORD=validation-db-password
DB_ROOT_PASSWORD=validation-root-password
jwt.secret=0123456789abcdef0123456789abcdef0123456789abcdef
encryption.key=fedcba9876543210fedcba9876543210fedcba9876543210
turnstile.enabled=true
turnstile.secretKey=validation-turnstile-secret
turnstile.action=login
turnstile.hostnames=ufe.a-415.win
VITE_TURNSTILE_SITE_KEY=validation-turnstile-site-key
google.clientId=validation.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=validation.apps.googleusercontent.com
EOF

variant() {
    file="$TMP/variant.env"
    sed "$@" "$base" > "$file"
    printf '%s' "$file"
}

run_validation() {
    env_file=$1
    err_file=$2
    (
        ENV_FILE="$env_file"
        export ENV_FILE
        . "$ROOT/deploy/scripts/lib/common.sh"
        validate_env_basics
    ) >/dev/null 2>"$err_file"
}

expect_ok() {
    name=$1
    env_file=$2
    err_file="$TMP/err.$$"
    if run_validation "$env_file" "$err_file"; then
        pass=$((pass + 1))
        printf 'OK   %s\n' "$name"
    else
        fail=$((fail + 1))
        printf 'FAIL %s: se esperaba validación correcta\n' "$name"
        sed -n '1,3p' "$err_file"
    fi
}

expect_fail_contains() {
    name=$1
    expected=$2
    env_file=$3
    err_file="$TMP/err.$$"
    if run_validation "$env_file" "$err_file"; then
        fail=$((fail + 1))
        printf 'FAIL %s: se esperaba rechazo\n' "$name"
        return
    fi
    if grep -Fq "$expected" "$err_file"; then
        pass=$((pass + 1))
        printf 'OK   %s\n' "$name"
    else
        fail=$((fail + 1))
        printf 'FAIL %s: no apareció el mensaje esperado\n' "$name"
        sed -n '1,3p' "$err_file"
    fi
}

expect_ok 'configuración de producción válida' "$base"
expect_ok 'Turnstile normaliza espacios y mayúsculas' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames= UFE.A-415.WIN , otro.example |')"
expect_fail_contains 'Turnstile rechaza hostname incompleto' 'turnstile.hostnames debe incluir ufe.a-415.win' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames=ufe.a-415|')"
expect_fail_contains 'Turnstile exige site key' 'Falta VITE_TURNSTILE_SITE_KEY' \
    "$(variant 's|^VITE_TURNSTILE_SITE_KEY=.*|VITE_TURNSTILE_SITE_KEY=|')"
expect_fail_contains 'Turnstile exige secret key' 'Falta turnstile.secretKey' \
    "$(variant 's|^turnstile.secretKey=.*|turnstile.secretKey=|')"
expect_fail_contains 'Turnstile no acepta protocolo en hostnames' 'hostnames sin protocolo' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames=https://ufe.a-415.win|')"
expect_fail_contains 'OAuth rechaza clientes distintos' 'mismo cliente web' \
    "$(variant 's|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=otro.apps.googleusercontent.com|')"
expect_fail_contains 'OAuth exige ambos clientes' 'juntos' \
    "$(variant 's|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=|')"
expect_fail_contains 'OAuth rechaza backend ausente' 'juntos' \
    "$(variant 's|^google\.clientId=.*|google.clientId=|')"
expect_fail_contains 'producción exige Turnstile habilitado' 'Turnstile debe estar habilitado' \
    "$(variant 's|^turnstile\.enabled=.*|turnstile.enabled=false|')"
expect_fail_contains 'producción exige CORS del frontend' 'cors.allowedOrigins debe incluir' \
    "$(variant 's|^cors\.allowedOrigins=.*|cors.allowedOrigins=https://otro.example|')"

dev="$TMP/dev.env"
cat > "$dev" <<'EOF'
CI_ENVIRONMENT=development
COMPOSE_PROJECT_NAME=sol_dev
APP_DOMAIN=localhost
API_DOMAIN=localhost
APP_URL=http://localhost:5173
app.baseURL=http://localhost:8080/
cors.allowedOrigins=http://localhost:5173
VITE_API_URL=http://localhost:8080
NGINX_MODE=http
DB_PORT=3307
DB_DATABASE=sol_validation
DB_USER=sol_validation
DB_PASSWORD=validation-db-password
DB_ROOT_PASSWORD=validation-root-password
jwt.secret=0123456789abcdef0123456789abcdef0123456789abcdef
encryption.key=fedcba9876543210fedcba9876543210fedcba9876543210
turnstile.enabled=false
turnstile.hostnames=localhost,127.0.0.1
google.clientId=
VITE_GOOGLE_CLIENT_ID=
EOF
expect_ok 'configuración de desarrollo sin Turnstile' "$dev"

sub=$(variant \
    -e 's|^APP_DOMAIN=.*|APP_DOMAIN=app.sol.test|' \
    -e 's|^API_DOMAIN=.*|API_DOMAIN=api.sol.test|' \
    -e 's|^APP_URL=.*|APP_URL=https://app.sol.test|' \
    -e 's|^app\.baseURL=.*|app.baseURL=https://api.sol.test/|' \
    -e 's|^cors\.allowedOrigins=.*|cors.allowedOrigins=https://app.sol.test|' \
    -e 's|^VITE_API_URL=.*|VITE_API_URL=https://api.sol.test|' \
    -e 's|^turnstile\.hostnames=.*|turnstile.hostnames=app.sol.test|')
expect_ok 'configuración de subdominios válida' "$sub"
expect_fail_contains 'subdominios exigen VITE_API_URL' 'VITE_API_URL es obligatorio' \
    "$(variant -e 's|^APP_DOMAIN=.*|APP_DOMAIN=app.sol.test|' -e 's|^API_DOMAIN=.*|API_DOMAIN=api.sol.test|' -e 's|^APP_URL=.*|APP_URL=https://app.sol.test|' -e 's|^app\.baseURL=.*|app.baseURL=https://api.sol.test/|' -e 's|^cors\.allowedOrigins=.*|cors.allowedOrigins=https://app.sol.test|' -e 's|^VITE_API_URL=.*|VITE_API_URL=|' -e 's|^turnstile\.hostnames=.*|turnstile.hostnames=app.sol.test|')"
expect_fail_contains 'APP_URL no acepta rutas' 'origen http(s) sin ruta' \
    "$(variant 's|^APP_URL=.*|APP_URL=https://ufe.a-415.win/app|')"
expect_fail_contains 'APP_DOMAIN no acepta protocolo' 'hostname válido' \
    "$(variant 's|^APP_DOMAIN=.*|APP_DOMAIN=https://ufe.a-415.win|')"
expect_fail_contains 'VITE_API_URL debe ser coherente' 'VITE_API_URL' \
    "$(variant 's|^VITE_API_URL=.*|VITE_API_URL=https://otro.example|')"
expect_fail_contains 'rechaza contraseña MySQL de ejemplo' 'DB_PASSWORD no puede' \
    "$(variant 's|^DB_PASSWORD=.*|DB_PASSWORD=password|')"
expect_fail_contains 'rechaza clave de cifrado de ejemplo' 'encryption.key no puede' \
    "$(variant 's|^encryption\.key=.*|encryption.key=changeme|')"
expect_fail_contains 'rechaza contraseñas MySQL iguales' 'deben ser distintas' \
    "$(variant 's|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=validation-db-password|')"

printf '\nResultado: %s correctas, %s fallidas.\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
