#!/bin/sh
# Pruebas de validación preventiva de desarrollo, sin leer el .env real.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/sol-validation-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

pass=0
fail=0

base="$TMP/base.env"
cat > "$base" <<'EOF'
CI_ENVIRONMENT=development
COMPOSE_PROJECT_NAME=sol_dev
APP_URL=http://localhost:5173
app.baseURL=http://localhost:8080/
cors.allowedOrigins=http://localhost:5173
VITE_API_URL=http://localhost:8080
DB_PORT=3307
DB_DATABASE=sol_validation
DB_USER=sol_validation
DB_PASSWORD=validation-db-password
DB_ROOT_PASSWORD=validation-root-password
jwt.secret=0123456789abcdef0123456789abcdef0123456789abcdef
encryption.key=fedcba9876543210fedcba9876543210fedcba9876543210
turnstile.enabled=true
turnstile.secretKey=validation-turnstile-secret
turnstile.hostnames=localhost,127.0.0.1
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

expect_ok 'configuración de desarrollo válida' "$base"
expect_ok 'Turnstile normaliza espacios y mayúsculas' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames= LOCALHOST , 127.0.0.1 |')"
expect_fail_contains 'Turnstile exige localhost' 'debe incluir localhost' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames=127.0.0.1|')"
expect_fail_contains 'Turnstile exige site key' 'Falta VITE_TURNSTILE_SITE_KEY' \
    "$(variant 's|^VITE_TURNSTILE_SITE_KEY=.*|VITE_TURNSTILE_SITE_KEY=|')"
expect_fail_contains 'Turnstile exige secret key' 'Falta turnstile.secretKey' \
    "$(variant 's|^turnstile.secretKey=.*|turnstile.secretKey=|')"
expect_fail_contains 'Turnstile exige hostnames' 'no puede estar vacío' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames=|')"
expect_fail_contains 'Turnstile rechaza booleano inválido' 'booleano' \
    "$(variant 's|^turnstile.enabled=.*|turnstile.enabled=quizas|')"
expect_ok 'Turnstile deshabilitado explícitamente en desarrollo' \
    "$(variant 's|^turnstile.enabled=.*|turnstile.enabled=false|')"
expect_fail_contains 'Turnstile no acepta protocolo en hostnames' 'hostnames sin protocolo' \
    "$(variant 's|^turnstile.hostnames=.*|turnstile.hostnames=https://localhost|')"
expect_fail_contains 'OAuth rechaza clientes distintos' 'mismo cliente web' \
    "$(variant 's|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=otro.apps.googleusercontent.com|')"
expect_fail_contains 'OAuth exige ambos clientes' 'juntos' \
    "$(variant 's|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=|')"
expect_fail_contains 'OAuth rechaza backend ausente' 'juntos' \
    "$(variant 's|^google\.clientId=.*|google.clientId=|')"
expect_fail_contains 'CORS debe incluir el frontend' 'cors.allowedOrigins debe incluir' \
    "$(variant 's|^cors\.allowedOrigins=.*|cors.allowedOrigins=http://otro.example|')"
expect_fail_contains 'APP_URL no acepta rutas' 'origen http(s) sin ruta' \
    "$(variant 's|^APP_URL=.*|APP_URL=http://localhost:5173/app|')"
expect_fail_contains 'APP_URL debe ser local' 'APP_URL debe apuntar' \
    "$(variant 's|^APP_URL=.*|APP_URL=http://localhost:9999|')"
expect_fail_contains 'VITE_API_URL debe ser local' 'VITE_API_URL debe apuntar' \
    "$(variant 's|^VITE_API_URL=.*|VITE_API_URL=http://localhost:9999|')"
expect_fail_contains 'rechaza contraseña MySQL de ejemplo' 'DB_PASSWORD no puede' \
    "$(variant 's|^DB_PASSWORD=.*|DB_PASSWORD=password|')"
expect_fail_contains 'rechaza clave de cifrado de ejemplo' 'encryption.key no puede' \
    "$(variant 's|^encryption\.key=.*|encryption.key=changeme|')"

printf '\nResultado: %s correctas, %s fallidas.\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
