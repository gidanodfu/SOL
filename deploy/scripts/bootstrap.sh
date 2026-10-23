#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

MODE=prod
case "${1:-}" in
    --dev) MODE=dev ;;
    --prod|'') MODE=prod ;;
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/bootstrap.sh [--dev|--prod]

Inicializa una instalación NUEVA: valida el .env raíz, construye imágenes,
espera MySQL, aplica migraciones, ejecuta SystemSeeder y verifica el
administrador. No ejecuta down -v ni elimina volúmenes.

--prod (por defecto) usa deploy/compose.prod.yaml y exige CI_ENVIRONMENT=production.
--dev  usa deploy/compose.dev.yaml para una instalación local de prueba.
USAGE
        exit 0
        ;;
    *) die "Opción desconocida: $1" ;;
esac

require_repo
docker_available
validate_env_basics
require_env INITIAL_ADMIN_USERNAME "Defina el usuario administrador inicial."
require_env INITIAL_ADMIN_PASSWORD "Defina la contraseña del administrador inicial."
export_admin_credentials

MODE_TLS=$(env_get NGINX_MODE)
if [ "$MODE" = "prod" ] && [ "$MODE_TLS" != "http" ]; then
    CERT_DIR=$(env_get TLS_CERTS_DIR)
    [ -n "$CERT_DIR" ] || die "Falta TLS_CERTS_DIR para HTTPS."
    [ -f "$(resolve_deploy_path "$CERT_DIR")/fullchain.pem" ] || die "Falta ${CERT_DIR}/fullchain.pem."
    [ -f "$(resolve_deploy_path "$CERT_DIR")/privkey.pem" ] || die "Falta ${CERT_DIR}/privkey.pem."
    [ "$MODE_TLS" = "subdomain" ] && require_env API_DOMAIN "Defina el dominio de la API para subdomain."
fi

if [ "$MODE" = "prod" ]; then
    [ "$(env_get CI_ENVIRONMENT)" = "production" ] || die "Para --prod, CI_ENVIRONMENT debe ser production."
    run_compose() { compose_prod "$@"; }
    compute_cmd=compose_prod
    wait_services="db backend frontend nginx"
else
    run_compose() { compose_dev "$@"; }
    compute_cmd=compose_dev
    wait_services="db backend frontend"
fi

# No inicializar sobre una base que ya contiene usuarios.
run_compose up -d db
wait_for_service "$compute_cmd" db 90

HAS_USERS=$(run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=\"users\";"' | tr -d '[:space:]')
if [ "${HAS_USERS:-0}" != "0" ]; then
    USER_COUNT=$(run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*) FROM users;
SQL
)
    if [ "${USER_COUNT:-0}" != "0" ]; then
        die "La base de datos ya contiene usuarios. bootstrap.sh es solo para instalaciones nuevas; use deploy.sh para actualizar."
    fi
fi

printf 'Construyendo imágenes...\n'
run_compose build

printf 'Aplicando migraciones...\n'
run_compose run --rm backend php spark migrate --all

printf 'Ejecutando SystemSeeder...\n'
run_compose run --rm -e INITIAL_ADMIN_USERNAME -e INITIAL_ADMIN_PASSWORD backend php spark db:seed SystemSeeder

ADMIN_USER=$(env_get INITIAL_ADMIN_USERNAME)
ADMIN_USER_SQL=$(printf '%s' "$ADMIN_USER" | sed "s/'/''/g")
ADMIN_COUNT=$(printf "SELECT COUNT(*) FROM users WHERE username='%s' AND rol='admin' AND estado='activo';\n" "$ADMIN_USER_SQL" | run_compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' | tr -d '[:space:]')
[ "${ADMIN_COUNT:-0}" = "1" ] || die "No se pudo verificar el administrador inicial. Revise los logs del backend."

printf 'Iniciando servicios...\n'
run_compose up -d
for service in $wait_services; do
    wait_for_service "$compute_cmd" "$service" 90
done

if [ "$MODE" = "prod" ]; then
    http_ok "$(nginx_health_url)" || die "La verificación /health de Nginx falló."
else
    http_ok "http://127.0.0.1:$(env_get DEV_API_PORT)/health" || die "La verificación /health del backend falló."
    http_ok "http://127.0.0.1:$(env_get DEV_FRONTEND_PORT)/" || die "El frontend no responde."
fi

printf '\nBootstrap completado correctamente.\n'
printf 'Frontend: %s\n' "$(env_get APP_URL)"
printf 'API:      %s\n' "$(env_get app.baseURL)"
printf 'No se eliminaron volúmenes. Para actualizaciones use deploy.sh.\n'
