#!/bin/sh
# Verifica el health check interno de Nginx sin DNS público.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
C="sol_internal_health_test_$$"
CONF=$(mktemp -d "${TMPDIR:-/tmp}/sol-health-conf.XXXXXX")
ENVF=$(mktemp "${TMPDIR:-/tmp}/sol-health-env.XXXXXX")
chmod 755 "$CONF"
chmod 600 "$ENVF"

cleanup() {
    docker rm -f "$C" >/dev/null 2>&1 || true
    rm -rf "$CONF" "$ENVF"
}
trap cleanup EXIT HUP INT TERM

cat > "$CONF/default.conf" <<'EOF'
server {
    listen 80;
    server_name internal.invalid;
    location = /health {
        return 200 "ok\n";
    }
}
EOF
cat > "$ENVF" <<'EOF'
CI_ENVIRONMENT=development
APP_DOMAIN=internal.invalid
API_DOMAIN=internal.invalid
APP_URL=http://localhost:5173
app.baseURL=http://localhost:8080/
DB_PORT=3307
DB_DATABASE=sol_health
DB_USER=sol_health
DB_PASSWORD=internal-health-only
DB_ROOT_PASSWORD=internal-health-root-only
jwt.secret=0123456789abcdef0123456789abcdef0123456789abcdef
encryption.key=fedcba9876543210fedcba9876543210fedcba9876543210
turnstile.enabled=false
EOF

docker run -d --rm --name "$C" --network none \
    -v "$CONF/default.conf:/etc/nginx/conf.d/default.conf:ro" \
    nginx:1.27.5-alpine >/dev/null

fake_compose() {
    [ "$1" = "ps" ] && [ "$2" = "-q" ] && [ "$3" = "nginx" ] && printf '%s\n' "$C"
}

ENV_FILE="$ENVF"
export ENV_FILE
. "$ROOT/deploy/scripts/lib/common.sh"

if nginx_internal_health fake_compose; then
    printf 'OK   health interno de Nginx con Host sin resolución DNS\n'
else
    printf 'FAIL health interno de Nginx\n' >&2
    exit 1
fi

missing_compose() {
    :
}
if (nginx_internal_health missing_compose) >/dev/null 2>&1; then
    printf 'FAIL el health interno aceptó un contenedor nginx ausente\n' >&2
    exit 1
fi
printf 'OK   health interno falla cuando nginx no está iniciado\n'
