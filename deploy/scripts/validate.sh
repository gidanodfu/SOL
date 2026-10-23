#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

BUILD=0
RUNTIME=0
for arg in "$@"; do
    case "$arg" in
        --build) BUILD=1 ;;
        --runtime) RUNTIME=1 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/validate.sh [--build] [--runtime]

Valida .env, variables obligatorias, Compose, Dockerfiles y coherencia básica.
--build   construye las imágenes de desarrollo.
--runtime comprueba servicios y endpoints si ya están levantados.
No imprime valores secretos.
USAGE
            exit 0
            ;;
        *) die "Opción desconocida: $arg" ;;
    esac
done

require_repo
docker_available
validate_env_basics

[ -f "$ENV_FILE" ] || die "Falta $ENV_FILE."
[ -f "$ROOT/.env.example" ] || die "Falta .env.example en la raíz."
[ -f "$ROOT/backend/Dockerfile" ] || die "Falta backend/Dockerfile."
[ -f "$ROOT/frontend/Dockerfile" ] || die "Falta frontend/Dockerfile."
[ -f "$ROOT/deploy/nginx/render.sh" ] || die "Falta deploy/nginx/render.sh."

printf 'Validando Compose desarrollo y producción...\n'
compose_dev config >/dev/null
compose_prod config >/dev/null

backend_env_file=${BACKEND_ENV_FILE:-$ROOT/deploy/runtime/backend.env}
[ -f "$backend_env_file" ] || die "No se generó el entorno filtrado del backend."
if grep -Eq '^(DB_ROOT_PASSWORD|INITIAL_ADMIN_|VITE_|DEV_|NGINX_|TLS_|APP_DOMAIN|API_DOMAIN|COMPOSE_PROJECT_NAME)=' "$backend_env_file"; then
    die "El entorno del backend contiene variables que no le corresponden."
fi
back_perm=$(stat -c '%a' "$backend_env_file" 2>/dev/null || echo '')
if [ -n "$back_perm" ] && [ "$back_perm" != "600" ] && [ "$back_perm" != "400" ]; then
    warn "Los permisos de $backend_env_file son $back_perm; se recomienda 600."
fi

if awk '
    /^  frontend:/ { in_frontend=1; next }
    /^  [a-zA-Z0-9_-]+:/ { if (in_frontend) exit }
    in_frontend && /^[[:space:]]*env_file:/ { found=1 }
    END { exit found ? 0 : 1 }
' "$ROOT/deploy/compose.yaml"; then
    die "El servicio frontend no debe usar env_file."
fi
if grep -q 'VITE_SECRET\|JWT_SECRET\|DB_PASSWORD\|RESEND_API_KEY' "$ROOT/frontend/Dockerfile"; then
    die "El Dockerfile del frontend no debe recibir variables privadas."
fi

MODE=$(env_get NGINX_MODE)
if [ "$MODE" = "same-domain" ] || [ "$MODE" = "subdomain" ]; then
    CERT_DIR=$(env_get TLS_CERTS_DIR)
    [ -n "$CERT_DIR" ] || die "Falta TLS_CERTS_DIR para HTTPS."
    [ -f "$(resolve_deploy_path "$CERT_DIR")/fullchain.pem" ] || die "Falta el certificado fullchain.pem en ${CERT_DIR}."
    [ -f "$(resolve_deploy_path "$CERT_DIR")/privkey.pem" ] || die "Falta la clave privada privkey.pem en ${CERT_DIR}."
fi

perm=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '')
if [ -n "$perm" ] && [ "$perm" != "600" ] && [ "$perm" != "400" ]; then
    warn "Los permisos de $ENV_FILE son $perm; se recomienda 600."
fi

if [ "$MODE" = "subdomain" ]; then
    [ -n "$(env_get API_DOMAIN)" ] || die "API_DOMAIN es obligatorio en modo subdomain."
fi

if [ "$BUILD" = "1" ]; then
    printf 'Construyendo imágenes de desarrollo...\n'
    compose_dev build
fi

if [ "$RUNTIME" = "1" ]; then
    printf 'Comprobando servicios en ejecución...\n'
    compose_dev ps
    http_ok "http://127.0.0.1:$(env_get DEV_API_PORT)/health" || die "Backend no responde en /health."
    http_ok "http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)/" || die "Frontend no responde."
fi

printf 'Configuración válida. Las comprobaciones no ejecutadas no se consideran superadas.\n'
