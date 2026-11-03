#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

TARGET=dev
BUILD=0
RUNTIME=0
for arg in "$@"; do
    case "$arg" in
        --dev) TARGET=dev ;;
        --build) BUILD=1 ;;
        --runtime) RUNTIME=1 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/validate.sh [--dev] [--build] [--runtime]

Valida .env, variables obligatorias, Compose, Dockerfiles y scripts sin
imprimir secretos.

  --dev       exige que el .env activo sea de desarrollo (por defecto).
  --build     construye las imágenes de desarrollo.
  --runtime   comprueba que backend y frontend respondan en local.
USAGE
            exit 0
            ;;
        *) die "Opción desconocida: $arg" ;;
    esac
done

require_repo
docker_available
validate_env_basics
require_dev_project

[ -f "$ENV_FILE" ] || die "Falta $ENV_FILE."
[ -f "$ROOT/.env.example" ] || die "Falta .env.example en la raíz."
[ -f "$ROOT/backend/Dockerfile" ] || die "Falta backend/Dockerfile."
[ -f "$ROOT/backend/php.ini" ] || die "Falta backend/php.ini."
[ -f "$ROOT/frontend/Dockerfile" ] || die "Falta frontend/Dockerfile."
[ -f "$ROOT/deploy/scripts/restore.sh" ] || die "Falta deploy/scripts/restore.sh."
[ -f "$ROOT/deploy/scripts/smoke.sh" ] || die "Falta deploy/scripts/smoke.sh."
[ -f "$ROOT/tests/smoke/test_docker_http.sh" ] || die "Falta tests/smoke/test_docker_http.sh."

printf 'Validando scripts de desarrollo...\n'
for script in \
    "$ROOT/deploy/scripts/dev.sh" \
    "$ROOT/deploy/scripts/test.sh" \
    "$ROOT/deploy/scripts/validate.sh" \
    "$ROOT/deploy/scripts/bootstrap.sh" \
    "$ROOT/deploy/scripts/backup.sh" \
    "$ROOT/deploy/scripts/restore.sh" \
    "$ROOT/deploy/scripts/smoke.sh" \
    "$ROOT/deploy/scripts/lib/common.sh"; do
    [ -f "$script" ] || die "Falta $script."
    [ -x "$script" ] || die "El script $script no es ejecutable."
    sh -n "$script" || die "Error de sintaxis shell en $script."
done
[ -x "$ROOT/tests/smoke/test_docker_http.sh" ] || die "La prueba HTTP no es ejecutable."
sh -n "$ROOT/tests/smoke/test_docker_http.sh" || die "Error de sintaxis en la prueba HTTP."
for test in \
    "$ROOT/tests/deploy/test_validation.sh" \
    "$ROOT/tests/deploy/test_docker_context.sh"; do
    [ -x "$test" ] || die "La prueba $test no es ejecutable."
    sh -n "$test" || die "Error de sintaxis en $test."
done

printf 'Validando Compose de desarrollo...\n'
compose_dev config -q
assert_compose_project compose_dev

printf 'Comprobando que las imágenes no usen etiquetas móviles...\n'
if grep -RInE '(^|[[:space:]])(image:[[:space:]]+[^[:space:]]+:latest|FROM[[:space:]]+[^[:space:]]+:latest)' \
    "$ROOT/deploy/compose.yaml" "$ROOT/backend/Dockerfile" "$ROOT/frontend/Dockerfile" >/dev/null 2>&1; then
    die "Hay imágenes con la etiqueta 'latest'; fije una versión explícita."
fi

backend_env_file=${BACKEND_ENV_FILE:-$ROOT/deploy/runtime/backend.env}
[ -f "$backend_env_file" ] || die "No se generó el entorno filtrado del backend."
if grep -Eq '^(DB_ROOT_PASSWORD|INITIAL_ADMIN_|VITE_|DEV_|COMPOSE_PROJECT_NAME)=' "$backend_env_file"; then
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
if [ -f "$ENV_FILE" ] && grep -Eq '^VITE_(JWT|DB_|RESEND|S3_|SMTP|EMAIL_|SUNAT|JSONPE|PRIVATE|SECRET|.*PASSWORD)' "$ENV_FILE"; then
    die "El .env contiene variables VITE_ con nombres de secretos privados."
fi

for entry in '.env' '.git' '.github' '**/.git' '**/.github' 'backend/writable' 'backend/vendor' 'frontend/node_modules' 'frontend/dist' 'deploy/runtime'; do
    grep -Fq "$entry" "$ROOT/.dockerignore" || die "Falta '$entry' en .dockerignore."
done
if git -C "$ROOT" ls-files | grep -Ev '(^|/)\.env\.example$' | \
    grep -Eq '(^|/)\.env($|\.)|\.pem$|\.key$|(^|/)acme\.json$|(^|/)deploy/runtime/'; then
    die "Hay archivos de entorno, certificados o secretos versionados en Git."
fi

if git -C "$ROOT" ls-files | grep -Eq '(^|/)(vendor|node_modules)/'; then
    die "Hay dependencias de Composer/npm versionadas por accidente. Elimínelas del índice."
fi
if compose_dev config 2>/dev/null | grep -Eq 'source: .*(backend/vendor|frontend/node_modules)'; then
    die "Compose monta vendor/node_modules del host; use las dependencias de la imagen."
fi
if [ -d "$ROOT/backend/vendor" ] || [ -d "$ROOT/frontend/node_modules" ] || [ -d "$ROOT/frontend/dist" ]; then
    warn "Hay artefactos locales (backend/vendor, frontend/node_modules o frontend/dist); el flujo oficial los ignora y los reconstruye dentro de Docker."
fi

perm=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '')
if [ -n "$perm" ] && [ "$perm" != "600" ] && [ "$perm" != "400" ]; then
    warn "Los permisos de $ENV_FILE son $perm; se recomienda 600."
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

printf 'Configuración válida para desarrollo. Las comprobaciones no ejecutadas no se consideran superadas.\n'
