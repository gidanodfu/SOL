#!/bin/sh

# Utilidades compartidas por los scripts de desarrollo de SOL.
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

    runtime_dir="$ROOT/deploy/runtime"
    backend_env="$runtime_dir/backend.env"

    umask 077
    mkdir -p "$runtime_dir"
    chmod 700 "$runtime_dir"

    # Lista explícita: el backend no recibe credenciales de MySQL root,
    # credenciales iniciales ni variables de Vite.
    grep -E '^(CI_ENVIRONMENT|APP_URL|TZ|app\.|cors\.|DB_HOST|DB_PORT|DB_DATABASE|DB_USER|DB_PASSWORD|DB_DRIVER|DB_PREFIX|encryption\.|jwt\.|storage\.|s3\.|apisperu\.|RESEND_|email\.|google\.clientId|turnstile\.|VITE_TURNSTILE_SITE_KEY|activacion\.|cvRateLimit\.)' "$ENV_FILE" > "$backend_env"
    chmod 600 "$backend_env"
    export BACKEND_ENV_FILE="$backend_env"
}

compose_dev() {
    prepare_backend_env
    docker compose --project-name "$(project_name)" --env-file "$ENV_FILE" -f "$COMPOSE_BASE" "$@"
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
    [ -n "$name" ] || die "Falta COMPOSE_PROJECT_NAME en $ENV_FILE. Use un nombre único."
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

require_dev_project() {
    require_project_name
    case "$(env_get CI_ENVIRONMENT)" in
        development|testing) ;;
        *) die "El entorno de desarrollo exige CI_ENVIRONMENT=development o testing en $ENV_FILE." ;;
    esac
}

volume_name() {
    printf '%s_%s' "$(project_name)" "$1"
}

trim_value() {
    printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

lower_value() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

valid_hostname() {
    _host=$(lower_value "$(trim_value "$1")")
    [ -n "$_host" ] || return 1
    [ "${#_host}" -le 253 ] || return 1
    case "$_host" in
        *[!a-z0-9.-]*|.*|*.|*..*) return 1 ;;
    esac
    printf '%s\n' "$_host" | awk -F. '
        { ok=1; for (i=1; i<=NF; i++) if ($i == "" || length($i) > 63 || $i ~ /^-/ || $i ~ /-$/) ok=0 }
        END { exit ok ? 0 : 1 }
    '
}

valid_origin() {
    _origin=$(trim_value "$1")
    case "$_origin" in
        http://*|https://*) ;;
        *) return 1 ;;
    esac
    _rest=${_origin#*://}
    [ -n "$_rest" ] || return 1
    case "$_rest" in
        */*|*'?'*|*'#'*) return 1 ;;
    esac
    _hostport=$_rest
    _host=${_hostport%%:*}
    [ -n "$_host" ] || return 1
    valid_hostname "$_host" || return 1
    if [ "$_hostport" != "$_host" ]; then
        _port=${_hostport#"$_host"}
        case "$_port" in
            :[0-9]*) ;;
            *) return 1 ;;
        esac
        _digits=${_port#:}
        [ "${#_digits}" -le 5 ] || return 1
        [ "$_digits" -ge 1 ] 2>/dev/null || return 1
        [ "$_digits" -le 65535 ] 2>/dev/null || return 1
    fi
    return 0
}

origin_from_url() {
    _url=$(trim_value "$1")
    case "$_url" in
        http://*|https://*) ;;
        *) return 1 ;;
    esac
    _scheme=${_url%%://*}
    _rest=${_url#*://}
    _authority=${_rest%%/*}
    case "$_authority" in
        ''|*'?'*|*'#'*) return 1 ;;
    esac
    printf '%s://%s' "$_scheme" "$_authority"
}

url_is_origin() {
    _url=$(trim_value "$1")
    _expected=$(origin_from_url "$_url") || return 1
    _normalized=${_url%/}
    [ "$(lower_value "$_normalized")" = "$(lower_value "$_expected")" ]
}

list_has() {
    _list=$1
    _want=$(lower_value "$(trim_value "$2")")
    [ -n "$_want" ] || return 1
    for _item in $(printf '%s' "$_list" | tr ',' ' '); do
        _item=$(lower_value "$(trim_value "$_item")")
        [ "$_item" = "$_want" ] && return 0
    done
    return 1
}

is_enabled() {
    case "$(lower_value "$(trim_value "$1")")" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

is_disabled() {
    case "$(lower_value "$(trim_value "$1")")" in
        ''|0|false|no|off) return 0 ;;
        *) return 1 ;;
    esac
}

dev_port() {
    _port=$(trim_value "$(env_get "$1")")
    case "$_port" in
        ''|*[!0-9]*) printf '%s' "$2" ;;
        *) printf '%s' "$_port" ;;
    esac
}

local_origin_matches() {
    _origin=$(lower_value "$(trim_value "$1")")
    _port=$2
    [ "$_origin" = "http://localhost:$_port" ] || [ "$_origin" = "http://127.0.0.1:$_port" ]
}

validate_turnstile() {
    _enabled=$(env_get turnstile.enabled)
    if is_enabled "$_enabled"; then
        _turnstile_on=1
    elif is_disabled "$_enabled"; then
        _turnstile_on=0
    else
        die "turnstile.enabled debe ser un booleano (true/false)."
    fi
    [ "$_turnstile_on" = "1" ] || return 0

    [ -n "$(env_get turnstile.secretKey)" ] || die "Falta turnstile.secretKey en $ENV_FILE."
    [ -n "$(env_get VITE_TURNSTILE_SITE_KEY)" ] || die "Falta VITE_TURNSTILE_SITE_KEY en $ENV_FILE."

    _hosts=$(env_get turnstile.hostnames)
    [ -n "$_hosts" ] || die "turnstile.hostnames no puede estar vacío cuando Turnstile está habilitado."
    for _item in $(printf '%s' "$_hosts" | tr ',' ' '); do
        _item=$(lower_value "$(trim_value "$_item")")
        valid_hostname "$_item" \
            || die "turnstile.hostnames debe contener hostnames sin protocolo, ruta ni puerto."
    done
    list_has "$_hosts" localhost \
        || die "turnstile.hostnames debe incluir localhost para el entorno local."
}

validate_google_oauth() {
    _google_backend=$(trim_value "$(env_get google.clientId)")
    _google_frontend=$(trim_value "$(env_get VITE_GOOGLE_CLIENT_ID)")

    if [ -n "$_google_backend" ] || [ -n "$_google_frontend" ]; then
        [ -n "$_google_backend" ] && [ -n "$_google_frontend" ] \
            || die "Google OAuth requiere google.clientId y VITE_GOOGLE_CLIENT_ID juntos."
        [ "$_google_backend" = "$_google_frontend" ] \
            || die "google.clientId y VITE_GOOGLE_CLIENT_ID deben corresponder al mismo cliente web."
    fi
}

validate_domains_and_urls() {
    _app_url=$(trim_value "$(env_get APP_URL)")
    url_is_origin "$_app_url" \
        || die "APP_URL debe ser un origen http(s) sin ruta."
    _app_origin=$(origin_from_url "$_app_url")

    _base_url=$(trim_value "$(env_get app.baseURL)")
    url_is_origin "$_base_url" \
        || die "app.baseURL debe ser una URL http(s) raíz, sin ruta adicional."
    _base_origin=$(origin_from_url "$_base_url")

    _frontend_port=$(dev_port DEV_FRONTEND_PORT 5173)
    _api_port=$(dev_port DEV_API_PORT 8080)

    local_origin_matches "$_app_origin" "$_frontend_port" \
        || die "APP_URL debe apuntar a http://localhost:$_frontend_port (o 127.0.0.1)."
    local_origin_matches "$_base_origin" "$_api_port" \
        || die "app.baseURL debe apuntar a http://localhost:$_api_port/ (o 127.0.0.1)."

    _cors=$(env_get cors.allowedOrigins)
    if [ -z "$(trim_value "$_cors")" ]; then
        warn "cors.allowedOrigins está vacío; se usará el valor por defecto del backend."
    else
        for _origin in $(printf '%s' "$_cors" | tr ',' ' '); do
            _origin=$(trim_value "$_origin")
            valid_origin "$_origin" \
                || die "cors.allowedOrigins contiene un origen inválido; use esquema, host y puerto opcional, sin ruta."
        done
        list_has "$_cors" "$_app_origin" \
            || die "cors.allowedOrigins debe incluir $_app_origin."
    fi

    _vite_api=$(trim_value "$(env_get VITE_API_URL)")
    if [ -n "$_vite_api" ]; then
        url_is_origin "$_vite_api" \
            || die "VITE_API_URL debe ser un origen http(s), sin ruta."
        _vite_origin=$(origin_from_url "$_vite_api")
        local_origin_matches "$_vite_origin" "$_api_port" \
            || die "VITE_API_URL debe apuntar a http://localhost:$_api_port (o 127.0.0.1)."
    fi
}

validate_secrets() {
    _db_password=$(env_get DB_PASSWORD)
    _db_root=$(env_get DB_ROOT_PASSWORD)
    _jwt=$(env_get jwt.secret)
    _encryption=$(env_get encryption.key)

    [ -n "$_encryption" ] || die "Falta encryption.key en $ENV_FILE."
    case "$_encryption" in
        cambie-*|change-me*|changeme*|example*|password|secret) die "encryption.key no puede ser un valor de ejemplo." ;;
    esac
    case "$_jwt" in
        cambie-*|change-me*|changeme*|example*|password|secret) die "jwt.secret no puede ser un valor de ejemplo." ;;
    esac
    case "$_db_password" in
        ''|password|secret|changeme|change-me) die "DB_PASSWORD no puede estar vacío ni ser un valor de ejemplo." ;;
    esac
    case "$_db_root" in
        ''|password|secret|changeme|change-me) die "DB_ROOT_PASSWORD no puede estar vacío ni ser un valor de ejemplo." ;;
    esac

    if [ "${#_db_password}" -lt 12 ] 2>/dev/null; then
        warn "DB_PASSWORD tiene menos de 12 caracteres; use una contraseña más fuerte."
    fi
    if [ "$_db_password" = "$_db_root" ]; then
        warn "DB_PASSWORD y DB_ROOT_PASSWORD son iguales; use contraseñas distintas."
    fi
    if [ "$_jwt" = "$_encryption" ]; then
        warn "jwt.secret y encryption.key son iguales; use claves distintas."
    fi

    case "$(env_get storage.driver)" in
        ''|local) ;;
        supabase)
            require_env storage.bucket "Defina el bucket privado de almacenamiento."
            require_env s3.endpoint "Defina el endpoint S3 de Supabase."
            require_env s3.accessKey "Defina la access key S3."
            require_env s3.secretKey "Defina la secret key S3."
            ;;
        *) die "storage.driver debe ser local o supabase." ;;
    esac
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
        fi
        sleep 2
        i=$((i + 1))
    done
    die "El servicio '$service' no alcanzó estado healthy."
}

# Comprobación HTTP dentro del contenedor; no requiere curl en el host.
dev_health() {
    compose_cmd="$1"
    service="$2"
    url="$3"
    $compose_cmd exec -T "$service" wget -qO- "$url" >/dev/null 2>&1
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
    [ -n "$id" ] || die "El servicio '$service' no está iniciado. Ejecute dev.sh up."
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
    require_env CI_ENVIRONMENT "Defina development o testing."
    require_env COMPOSE_PROJECT_NAME "Defina un nombre de proyecto Compose único."
    require_project_name
    case "$(env_get CI_ENVIRONMENT)" in
        development|testing) ;;
        *) die "CI_ENVIRONMENT debe ser development o testing en este repositorio." ;;
    esac
    require_dev_project
    require_env APP_URL "Defina la URL local del frontend."
    require_env app.baseURL "Defina la URL local de la API."
    require_env DB_DATABASE "Defina el nombre de la base de datos."
    require_env DB_USER "Defina el usuario de la base de datos."
    require_env DB_PASSWORD "Defina la contraseña de la base de datos."
    require_env DB_ROOT_PASSWORD "Defina la contraseña root de MySQL."
    require_env jwt.secret "Defina una clave JWT exclusiva del entorno."
    require_env encryption.key "Defina una clave de cifrado exclusiva del entorno."

    case "$(env_get DB_PORT)" in
        ''|*[!0-9]*) die "DB_PORT debe ser numérico." ;;
    esac

    validate_domains_and_urls
    validate_turnstile
    validate_google_oauth
    validate_secrets
}
