#!/bin/sh

# Utilidades compartidas por los scripts de operación de SOL.
# No carga el .env con `source`: se parsea de forma segura y sin evaluar shell.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
case "$ENV_FILE" in
    /*) ;;
    *) ENV_FILE="$PWD/$ENV_FILE" ;;
esac
export ENV_FILE
if [ -n "${BACKEND_ENV_FILE:-}" ]; then
    case "$BACKEND_ENV_FILE" in
        /*) ;;
        *) BACKEND_ENV_FILE="$PWD/$BACKEND_ENV_FILE" ;;
    esac
    export BACKEND_ENV_FILE
else
    BACKEND_ENV_FILE=""
fi
COMPOSE_BASE="$ROOT/deploy/compose.yaml"
COMPOSE_DEV="$ROOT/deploy/compose.dev.yaml"
COMPOSE_PROD="$ROOT/deploy/compose.prod.yaml"

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

warn() {
    printf 'ADVERTENCIA: %s\n' "$*" >&2
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Falta el comando '$1'. Instálelo antes de continuar."
}

require_file() {
    [ -f "$1" ] || die "No existe el archivo requerido: $1"
}

require_env_file() {
    [ -f "$ENV_FILE" ] || die "Falta $ENV_FILE. Copie .env.example a .env y complete los valores."
    [ -r "$ENV_FILE" ] || die "El archivo $ENV_FILE no es legible."
}

# Lee una clave simple del .env sin ejecutarlo. Devuelve el valor sin comillas.
env_get() {
    key="$1"
    [ -f "$ENV_FILE" ] || return 0
    awk -v key="$key" '
        /^[[:space:]]*#/ { next }
        {
            line=$0
            sub(/^[[:space:]]*export[[:space:]]+/, "", line)
            pos=index(line, "=")
            if (pos == 0) next
            k=substr(line, 1, pos-1)
            gsub(/[[:space:]]/, "", k)
            if (k != key) next
            v=substr(line, pos+1)
            sub(/^[[:space:]]*/, "", v)
            sub(/[[:space:]]*$/, "", v)
            if (v ~ /^".*"$/ || v ~ /^\047.*\047$/) v=substr(v, 2, length(v)-2)
            print v
            exit
        }
    ' "$ENV_FILE"
}

require_env() {
    key="$1"
    purpose="$2"
    value=$(env_get "$key")
    [ -n "$value" ] || die "Falta $key en $ENV_FILE. $purpose"
}

env_has_duplicates() {
    [ -f "$ENV_FILE" ] || return 1
    awk '
        /^[[:space:]]*#/ { next }
        {
            line=$0
            sub(/^[[:space:]]*export[[:space:]]+/, "", line)
            pos=index(line, "=")
            if (pos == 0) next
            k=substr(line, 1, pos-1)
            gsub(/[[:space:]]/, "", k)
            if (k == "") next
            count[k]++
        }
        END {
            for (k in count) if (count[k] > 1) { print k; bad=1 }
            exit bad ? 0 : 1
        }
    ' "$ENV_FILE"
}

prepare_backend_env() {
    if [ -n "${BACKEND_ENV_FILE:-}" ] && [ -f "$BACKEND_ENV_FILE" ]; then
        return 0
    fi

    [ -f "$ENV_FILE" ] || die "No existe $ENV_FILE."

    local runtime_dir="$ROOT/deploy/runtime"
    local backend_env="$runtime_dir/backend.env"

    umask 077
    mkdir -p "$runtime_dir"
    chmod 700 "$runtime_dir"

    # Lista explícita: el backend no recibe credenciales de MySQL root,
    # credenciales iniciales, variables de Vite ni configuración de Nginx/TLS.
    grep -E '^(CI_ENVIRONMENT|APP_URL|TZ|app\.|cors\.|DB_HOST|DB_PORT|DB_DATABASE|DB_USER|DB_PASSWORD|DB_DRIVER|DB_PREFIX|encryption\.|jwt\.|storage\.|s3\.|sunat\.token|jsonpe\.token|RESEND_|email\.|google\.clientId|turnstile\.|activacion\.)' "$ENV_FILE" > "$backend_env"
    chmod 600 "$backend_env"
    export BACKEND_ENV_FILE="$backend_env"
}

compose_dev() {
    prepare_backend_env
    docker compose --project-name "$(project_name)" --env-file "$ENV_FILE" -f "$COMPOSE_BASE" -f "$COMPOSE_DEV" "$@"
}

compose_prod() {
    prepare_backend_env
    docker compose --project-name "$(project_name)" --env-file "$ENV_FILE" -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" "$@"
}

export_admin_credentials() {
    export INITIAL_ADMIN_USERNAME="$(env_get INITIAL_ADMIN_USERNAME)"
    export INITIAL_ADMIN_PASSWORD="$(env_get INITIAL_ADMIN_PASSWORD)"
}

project_name() {
    name=$(env_get COMPOSE_PROJECT_NAME)
    printf '%s' "${name:-sol_dev}"
}

require_project_name() {
    name=$(env_get COMPOSE_PROJECT_NAME)
    [ -n "$name" ] || die "Falta COMPOSE_PROJECT_NAME en $ENV_FILE. Use un nombre único por entorno."
    case "$name" in
        *[!A-Za-z0-9_.-]*) die "COMPOSE_PROJECT_NAME contiene caracteres no válidos: use letras, números, punto, guion o guion bajo." ;;
    esac
}

# Comprueba que el nombre del proyecto Compose coincide con el .env activo.
assert_compose_project() {
    compose_cmd="$1"
    expected="$(project_name)"
    actual=$($compose_cmd config 2>/dev/null | sed -n 's/^name: //p' | head -n 1)
    [ -n "$actual" ] || die "No se pudo determinar el nombre del proyecto Compose."
    [ "$actual" = "$expected" ] || die "El proyecto Compose activo ('$actual') no coincide con COMPOSE_PROJECT_NAME ('$expected')."
}

require_prod_project() {
    require_project_name
    [ "$(env_get CI_ENVIRONMENT)" = "production" ] || die "El entorno de producción exige CI_ENVIRONMENT=production en $ENV_FILE."
    [ "$(project_name)" != "sol_dev" ] || die "Producción no puede usar COMPOSE_PROJECT_NAME=sol_dev. Defina un nombre propio, por ejemplo sol_prod."
}

require_dev_project() {
    require_project_name
    case "$(env_get CI_ENVIRONMENT)" in
        development|testing) ;;
        *) die "El entorno de desarrollo exige CI_ENVIRONMENT=development o testing en $ENV_FILE." ;;
    esac
    [ "$(project_name)" != "sol_prod" ] || die "Desarrollo no puede usar el nombre de proyecto de producción (sol_prod)."
}

# Resuelve una ruta relativa al directorio deploy/ o devuelve una absoluta.
resolve_deploy_path() {
    case "$1" in
        /*) printf '%s' "$1" ;;
        *) printf '%s/deploy/%s' "$ROOT" "${1#./}" ;;
    esac
}

volume_name() {
    printf '%s_%s' "$(project_name)" "$1"
}

wait_for_service() {
    compose_cmd="$1"
    service="$2"
    attempts="${3:-60}"
    i=1
    while [ "$i" -le "$attempts" ]; do
        id=$($compose_cmd ps -q "$service" 2>/dev/null || true)
        if [ -n "$id" ]; then
            status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)
            [ "$status" = "healthy" ] && return 0
            [ "$status" = "running" ] && [ "$service" = "nginx" ] && return 0
        fi
        sleep 2
        i=$((i + 1))
    done
    die "El servicio '$service' no alcanzó estado healthy."
}

http_ok() {
    url="$1"
    require_cmd curl
    curl -fsS --max-time 10 "$url" >/dev/null
}

nginx_health_url() {
    mode=$(env_get NGINX_MODE)
    if [ "$mode" = "subdomain" ]; then
        printf 'https://%s/health' "$(env_get API_DOMAIN)"
    else
        base=$(env_get APP_URL)
        printf '%s/health' "${base%/}"
    fi
}

docker_available() {
    require_cmd docker
    docker compose version >/dev/null 2>&1 || die "Docker Compose v2 no está disponible."

    engine_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null | sed 's/[^0-9.].*$//')
    engine_major=${engine_version%%.*}
    case "$engine_major" in
        ''|*[!0-9]*) warn "No se pudo determinar la versión de Docker Engine; se requiere >= 24." ;;
        *) [ "$engine_major" -ge 24 ] || die "Docker Engine $engine_version es demasiado antiguo; se requiere >= 24." ;;
    esac

    compose_version=$(docker compose version --short 2>/dev/null | sed 's/^v//')
    compose_major=${compose_version%%.*}
    compose_rest=${compose_version#*.}
    compose_minor=${compose_rest%%.*}
    case "$compose_major:$compose_minor" in
        *[!0-9:]*|:*) warn "No se pudo determinar la versión de Docker Compose; se requiere >= 2.24." ;;
        *)
            if [ "$compose_major" -lt 2 ] || { [ "$compose_major" -eq 2 ] && [ "$compose_minor" -lt 24 ]; }; then
                die "Docker Compose $compose_version es demasiado antiguo; se requiere >= 2.24."
            fi
            ;;
    esac
}

require_service_running() {
    compose_cmd="$1"
    service="$2"
    id=$($compose_cmd ps -q "$service" 2>/dev/null || true)
    [ -n "$id" ] || die "El servicio '$service' no está iniciado. Ejecute dev.sh up o el procedimiento de despliegue correspondiente."
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)
    [ "$status" = "running" ] || [ "$status" = "healthy" ] || die "El servicio '$service' no está en ejecución (estado: ${status:-desconocido})."
}

require_repo() {
    [ -f "$COMPOSE_BASE" ] || die "No se encontró deploy/compose.yaml. Ejecute el script desde un clon de SOL."
    [ -f "$ROOT/backend/Dockerfile" ] || die "Falta backend/Dockerfile."
    [ -f "$ROOT/frontend/Dockerfile" ] || die "Falta frontend/Dockerfile."
}

validate_env_basics() {
    require_env_file
    if env_has_duplicates; then
        die "Hay variables duplicadas en $ENV_FILE. Deje una sola definición por variable."
    fi
    require_env CI_ENVIRONMENT "Defina development, testing o production."
    require_env COMPOSE_PROJECT_NAME "Defina un nombre de proyecto Compose único."
    require_project_name
    require_env APP_DOMAIN "Defina el dominio público del frontend."
    require_env APP_URL "Defina la URL pública del frontend."
    require_env app.baseURL "Defina la URL pública de la API."
    require_env DB_DATABASE "Defina el nombre de la base de datos."
    require_env DB_USER "Defina el usuario de la base de datos."
    require_env DB_PASSWORD "Defina la contraseña de la base de datos."
    require_env DB_ROOT_PASSWORD "Defina la contraseña root de MySQL."
    require_env jwt.secret "Defina una clave JWT exclusiva del entorno."

    case "$(env_get APP_URL)" in
        http://*|https://*) ;;
        *) die "APP_URL debe comenzar con http:// o https://." ;;
    esac
    case "$(env_get app.baseURL)" in
        http://*|https://*) ;;
        *) die "app.baseURL debe comenzar con http:// o https://." ;;
    esac
    case "$(env_get DB_PORT)" in
        ''|*[!0-9]*) die "DB_PORT debe ser numérico." ;;
    esac
    case "$(env_get NGINX_MODE)" in
        ''|http|same-domain|subdomain) ;;
        *) die "NGINX_MODE debe ser http, same-domain o subdomain." ;;
    esac

    case "$(env_get CI_ENVIRONMENT)" in
        production)
            if [ "$(env_get jwt.secret)" = "cambie-esta-clave-por-una-aleatoria-de-64-caracteres" ]; then
                die "No use el jwt.secret de .env.example en producción."
            fi
            jwt_secret=$(env_get jwt.secret)
            if [ "${#jwt_secret}" -lt 32 ] 2>/dev/null; then
                die "jwt.secret debe tener al menos 32 caracteres en producción."
            fi
            [ "$(project_name)" != "sol_dev" ] || die "Producción no puede usar COMPOSE_PROJECT_NAME=sol_dev."
            case "$(env_get APP_DOMAIN)" in
                localhost|127.0.0.1) die "APP_DOMAIN no puede ser localhost en producción." ;;
            esac
            case "$(env_get APP_URL)" in
                https://*) ;;
                *) warn "APP_URL no usa HTTPS en producción; confirme que un proxy externo termina TLS." ;;
            esac
            case "$(env_get app.baseURL)" in
                https://*) ;;
                *) warn "app.baseURL no usa HTTPS en producción; confirme que un proxy externo termina TLS." ;;
            esac
            case "$(env_get NGINX_MODE)" in
                http) warn "NGINX_MODE=http en producción solo es válido si un proxy externo termina TLS." ;;
            esac
            if [ "$(env_get DB_PASSWORD)" = "$(env_get DB_ROOT_PASSWORD)" ]; then
                warn "DB_PASSWORD y DB_ROOT_PASSWORD son iguales; use contraseñas distintas."
            fi
            ;;
    esac

    jwt_secret=$(env_get jwt.secret)
    if [ "${#jwt_secret}" -lt 32 ] 2>/dev/null; then
        warn "jwt.secret tiene menos de 32 caracteres; use una clave aleatoria más larga."
    fi
}
