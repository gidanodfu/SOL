#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

TARGET=all
BUILD=0
BUILD_PROD=0
RUNTIME=0
PUBLIC_SMOKE=0
for arg in "$@"; do
    case "$arg" in
        --dev) TARGET=dev ;;
        --prod) TARGET=prod ;;
        --all) TARGET=all ;;
        --build) BUILD=1 ;;
        --build-prod) BUILD_PROD=1 ;;
        --runtime) RUNTIME=1 ;;
        --public-smoke) PUBLIC_SMOKE=1 ;;
        -h|--help)
            cat <<'USAGE'
Uso: deploy/scripts/validate.sh [--dev|--prod|--all] [--build] [--build-prod] [--runtime] [--public-smoke]

Valida .env, variables obligatorias, Compose, Dockerfiles, scripts y coherencia
básica sin imprimir secretos. Por defecto valida la sintaxis de ambos entornos.

  --dev         exige que el .env activo sea de desarrollo.
  --prod        exige CI_ENVIRONMENT=production, un proyecto distinto de
                sol_dev y la red exclusiva Traefik ↔ SOL disponible.
  --build       construye las imágenes de desarrollo.
  --build-prod  construye las imágenes de producción (requiere .env de producción).
  --runtime     comprueba servicios y endpoints del entorno seleccionado.
                En producción usa el health check interno de Nginx.
  --public-smoke  con --runtime, comprueba además el dominio público, TLS y
                certificado. Requiere DNS y certificado válidos.
USAGE
            exit 0
            ;;
        *) die "Opción desconocida: $arg" ;;
    esac
done

require_repo
docker_available
validate_env_basics

# Valida la fuente única de ACME y la configuración estática de Traefik sin
# usar el .env privado de producción. El correo y el CA son ficticios.
validate_traefik_config() {
    infra="$ROOT/deploy/infra/traefik"
    for file in compose.yaml traefik.yml entrypoint.sh check-acme.sh .env.example; do
        [ -f "$infra/$file" ] || die "Falta deploy/infra/traefik/$file."
    done
    [ -x "$infra/entrypoint.sh" ] || die "deploy/infra/traefik/entrypoint.sh debe ser ejecutable."
    [ -x "$infra/check-acme.sh" ] || die "deploy/infra/traefik/check-acme.sh debe ser ejecutable."
    sh -n "$infra/entrypoint.sh" || die "Error de sintaxis en el entrypoint de Traefik."
    sh -n "$infra/check-acme.sh" || die "Error de sintaxis en check-acme.sh."

    grep -Fq 'certificatesResolvers:' "$infra/traefik.yml" \
        || die "traefik.yml debe contener el resolver ACME letsencrypt."
    grep -Fq 'letsencrypt:' "$infra/traefik.yml" \
        || die "El resolver ACME debe llamarse letsencrypt."
    grep -Fq 'email: __ACME_EMAIL__' "$infra/traefik.yml" \
        || die "traefik.yml debe usar __ACME_EMAIL__ como variable de render."
    grep -Fq 'caServer: __ACME_CA_SERVER__' "$infra/traefik.yml" \
        || die "traefik.yml debe usar __ACME_CA_SERVER__ como variable de render."
    grep -Fq 'storage: /acme/acme.json' "$infra/traefik.yml" \
        || die "El almacenamiento ACME debe ser /acme/acme.json."
    grep -Fq 'entryPoint: web' "$infra/traefik.yml" \
        || die "El desafío HTTP-01 debe usar el entryPoint web."
    grep -Fq 'exposedByDefault: false' "$infra/traefik.yml" \
        || die "El proveedor Docker debe mantener exposedByDefault=false."
    grep -Fq 'network: __PROXY_NETWORK__' "$infra/traefik.yml" \
        || die "La red del proveedor Docker debe renderizarse desde PROXY_NETWORK."
    grep -Fq 'dashboard: false' "$infra/traefik.yml" \
        || die "El dashboard de Traefik no debe habilitarse."
    grep -Fq 'insecure: false' "$infra/traefik.yml" \
        || die "La API de Traefik no debe habilitarse en modo inseguro."
    grep -Fq 'scheme: https' "$infra/traefik.yml" \
        || die "El entrypoint web debe redirigir a HTTPS."
    grep -Fq '/var/run/docker.sock:/var/run/docker.sock:ro' "$infra/compose.yaml" \
        || die "El socket Docker debe montarse como solo lectura."
    grep -Fq 'POST: "0"' "$infra/compose.yaml" \
        || die "El socket proxy debe bloquear POST."
    grep -Fq 'entrypoint:' "$infra/compose.yaml" \
        || die "El stack de Traefik debe usar el entrypoint de renderizado."
    grep -Fq -- '--configFile=/tmp/traefik.rendered.yml' "$infra/compose.yaml" \
        || die "Traefik debe cargar el archivo estático renderizado."
    if grep -Fq -- '--certificatesresolvers' "$infra/compose.yaml"; then
        die "No duplique ACME en compose.yaml; la fuente única es traefik.yml."
    fi

    rendered_env=$(mktemp "${TMPDIR:-/tmp}/sol-traefik-env.XXXXXX")
    rendered_cfg=$(mktemp "${TMPDIR:-/tmp}/sol-traefik-config.XXXXXX")
    cat > "$rendered_env" <<'EOF'
TRAEFIK_PROJECT_NAME=sol_infra
PROXY_NETWORK=proxy
PROXY_SUBNET=172.30.0.0/24
SOL_ENTRY_NETWORK=sol_entry
SOL_ENTRY_SUBNET=172.31.0.0/29
TRAEFIK_ENTRY_IP=172.31.0.2
TRAEFIK_SOCKET_NETWORK=traefik_socket
TRAEFIK_HTTP_PORT=80
TRAEFIK_HTTPS_PORT=443
ACME_EMAIL=ci@example.com
ACME_CA_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory
EOF
    if ! (cd "$infra" && docker compose --project-name sol_infra --env-file "$rendered_env" -f compose.yaml config) > "$rendered_cfg" 2>/dev/null; then
        rm -f "$rendered_env" "$rendered_cfg"
        die "No se pudo resolver la configuración Compose de Traefik con variables de prueba."
    fi
    grep -Fq -- '--configFile=/tmp/traefik.rendered.yml' "$rendered_cfg" \
        || die "La configuración resuelta no carga el archivo estático renderizado."
    grep -Fq 'ACME_EMAIL: ci@example.com' "$rendered_cfg" \
        || die "La configuración resuelta no propaga ACME_EMAIL."
    grep -Fq 'ACME_CA_SERVER: https://acme-staging-v02.api.letsencrypt.org/directory' "$rendered_cfg" \
        || die "La configuración resuelta no propaga ACME_CA_SERVER."
    grep -Fq 'source: traefik_acme' "$rendered_cfg" \
        || die "La configuración resuelta no monta el volumen ACME."
    grep -Fq 'name: sol_infra_traefik_acme' "$rendered_cfg" \
        || die "El volumen ACME debe conservar el nombre sol_infra_traefik_acme."
    rm -f "$rendered_env" "$rendered_cfg"

    grep -Fq 'traefik.http.routers.sol.tls.certresolver: letsencrypt' "$ROOT/deploy/compose.prod.yaml" \
        || die "El router de SOL debe usar el resolver letsencrypt."
}

validate_traefik_config

[ -f "$ENV_FILE" ] || die "Falta $ENV_FILE."
[ -f "$ROOT/.env.example" ] || die "Falta .env.example en la raíz."
[ -f "$ROOT/backend/Dockerfile" ] || die "Falta backend/Dockerfile."
[ -f "$ROOT/backend/php.ini" ] || die "Falta backend/php.ini."
[ -f "$ROOT/backend/php.prod.ini" ] || die "Falta backend/php.prod.ini."
[ -f "$ROOT/frontend/Dockerfile" ] || die "Falta frontend/Dockerfile."
[ -f "$ROOT/frontend/nginx.conf" ] || die "Falta frontend/nginx.conf."
[ -f "$ROOT/deploy/nginx/render.sh" ] || die "Falta deploy/nginx/render.sh."
[ -f "$ROOT/deploy/nginx/templates/app.http.conf.template" ] || die "Falta la plantilla Nginx HTTP de dominio único."
[ -f "$ROOT/deploy/nginx/templates/app.http.subdomain.conf.template" ] || die "Falta la plantilla Nginx HTTP de subdominios."
[ -f "$ROOT/deploy/nginx/templates/app.https.same-domain.conf.template" ] || die "Falta la plantilla Nginx HTTPS same-domain legado."
[ -f "$ROOT/deploy/nginx/templates/app.https.subdomain.conf.template" ] || die "Falta la plantilla Nginx HTTPS subdomain legado."
[ -f "$ROOT/deploy/scripts/restore.sh" ] || die "Falta deploy/scripts/restore.sh."
[ -f "$ROOT/deploy/scripts/smoke.sh" ] || die "Falta deploy/scripts/smoke.sh."
[ -f "$ROOT/tests/smoke/test_docker_http.sh" ] || die "Falta tests/smoke/test_docker_http.sh."

case "$TARGET" in
    dev) require_dev_project ;;
    prod)
        require_prod_project
        require_sol_entry_network
        require_traefik_entry
        ;;
    all)
        if [ "$(env_get CI_ENVIRONMENT)" = "production" ]; then
            require_prod_project
            require_sol_entry_network
            require_traefik_entry
        else
            printf 'Aviso: el .env activo no es de producción; se valida la sintaxis de prod sin sus guardias.\n'
        fi
        ;;
esac

printf 'Validando scripts de operación...\n'
for script in \
    "$ROOT/deploy/scripts/dev.sh" \
    "$ROOT/deploy/scripts/test.sh" \
    "$ROOT/deploy/scripts/validate.sh" \
    "$ROOT/deploy/scripts/deploy.sh" \
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
    "$ROOT/tests/deploy/test_internal_health.sh" \
    "$ROOT/tests/infra/test_traefik_acme.sh"; do
    [ -x "$test" ] || die "La prueba $test no es ejecutable."
    sh -n "$test" || die "Error de sintaxis en $test."
done

printf 'Validando Compose desarrollo y producción...\n'
compose_dev config -q
compose_prod config -q
assert_compose_project compose_dev
assert_compose_project compose_prod

printf 'Comprobando que producción no publique puertos...\n'
if compose_prod config 2>/dev/null | grep -q 'published:'; then
    die "El stack de producción publica puertos al host; solo Traefik debe publicar 80/443."
fi
if ! compose_prod config 2>/dev/null | awk '
    /^  nginx:/ { in_nginx=1; next }
    /^  [a-zA-Z0-9_-]+:/ { if (in_nginx) exit }
    in_nginx && /^    networks:/ { in_net=1; next }
    in_net && index($0, "      entry:") == 1 { found=1; exit }
    END { exit found ? 0 : 1 }
'; then
    die "El Nginx de SOL no está conectado a la red de entrada exclusiva 'entry'."
fi
if compose_prod config 2>/dev/null | awk '
    /^  nginx:/ { in_nginx=1; next }
    /^  [a-zA-Z0-9_-]+:/ { if (in_nginx) exit }
    in_nginx && /^    networks:/ { in_net=1; next }
    in_net && index($0, "      proxy:") == 1 { found=1; exit }
    END { exit found ? 0 : 1 }
'; then
    die "El Nginx de SOL no debe unirse a la red compartida 'proxy'; use la red de entrada exclusiva."
fi
if ! compose_prod config 2>/dev/null | grep -Fq "traefik.docker.network: $(sol_entry_network)"; then
    die "El Nginx de SOL no apunta a la red de entrada '$(sol_entry_network)' en sus labels."
fi
if ! compose_prod config 2>/dev/null | grep -q 'traefik.http.routers.sol.rule'; then
    die "Faltan las labels de enrutamiento de Traefik en el Nginx de SOL."
fi

printf 'Comprobando que las imágenes no usen etiquetas móviles...\n'
if grep -RInE '(^|[[:space:]])(image:[[:space:]]+[^[:space:]]+:latest|FROM[[:space:]]+[^[:space:]]+:latest)' \
    "$ROOT/deploy/compose.yaml" "$ROOT/deploy/compose.dev.yaml" "$ROOT/deploy/compose.prod.yaml" \
    "$ROOT/backend/Dockerfile" "$ROOT/frontend/Dockerfile" >/dev/null 2>&1; then
    die "Hay imágenes con la etiqueta 'latest'; fije una versión explícita."
fi

backend_env_file=${BACKEND_ENV_FILE:-$ROOT/deploy/runtime/backend.env}
[ -f "$backend_env_file" ] || die "No se generó el entorno filtrado del backend."
if grep -Eq '^(DB_ROOT_PASSWORD|INITIAL_ADMIN_|VITE_|DEV_|NGINX_|TLS_|APP_DOMAIN|API_DOMAIN|COMPOSE_PROJECT_NAME|ACME_|TRAEFIK_|PROXY_|SOL_ENTRY_)=' "$backend_env_file"; then
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

for entry in '.env' 'backend/writable' 'backend/vendor' 'frontend/node_modules' 'frontend/dist' 'deploy/runtime'; do
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
    die "Compose de desarrollo monta vendor/node_modules del host; use las dependencias de la imagen."
fi
if [ -d "$ROOT/backend/vendor" ] || [ -d "$ROOT/frontend/node_modules" ] || [ -d "$ROOT/frontend/dist" ]; then
    warn "Hay artefactos locales (backend/vendor, frontend/node_modules o frontend/dist); el flujo oficial los ignora y los reconstruye dentro de Docker."
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
if [ "$BUILD_PROD" = "1" ]; then
    require_prod_project
    printf 'Construyendo imágenes de producción...\n'
    compose_prod build
fi

if [ "$RUNTIME" = "1" ]; then
    printf 'Comprobando servicios en ejecución...\n'
    if [ "$TARGET" = "prod" ]; then
        require_sol_entry_network
        require_traefik_entry
        compose_prod ps
        nginx_internal_health compose_prod
        if [ "$PUBLIC_SMOKE" = "1" ]; then
            public_nginx_health || die "El smoke público de Nginx falló; revise DNS, TLS y certificado."
        else
            printf 'Smoke público omitido; use --public-smoke cuando DNS/TLS estén disponibles.\n'
        fi
    else
        compose_dev ps
        http_ok "http://127.0.0.1:$(env_get DEV_API_PORT)/health" || die "Backend no responde en /health."
        http_ok "http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)/" || die "Frontend no responde."
    fi
fi

printf 'Configuración válida para el objetivo: %s. Las comprobaciones no ejecutadas no se consideran superadas.\n' "$TARGET"
