#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

case "${1:-}" in
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/deploy.sh

Actualiza una instalación de producción existente: valida el entorno, crea un
respaldo, construye imágenes, aplica migraciones y recrea servicios sin borrar
volúmenes. No ejecuta SystemSeeder ni restablece contraseñas.
USAGE
        exit 0
        ;;
    '') ;;
    *) die "Opción desconocida: $1" ;;
esac

require_repo
docker_available
validate_env_basics
[ "$(env_get CI_ENVIRONMENT)" = "production" ] || die "deploy.sh requiere CI_ENVIRONMENT=production en el .env activo."
require_env APP_DOMAIN "Defina el dominio público del frontend."

case "$(env_get NGINX_MODE)" in
    http) ;;
    same-domain|subdomain)
        CERT_DIR=$(env_get TLS_CERTS_DIR)
        [ -n "$CERT_DIR" ] || die "Falta TLS_CERTS_DIR."
        [ -f "$(resolve_deploy_path "$CERT_DIR")/fullchain.pem" ] || die "No existe ${CERT_DIR}/fullchain.pem."
        [ -f "$(resolve_deploy_path "$CERT_DIR")/privkey.pem" ] || die "No existe ${CERT_DIR}/privkey.pem."
        ;;
esac

printf 'Validando configuración Compose...\n'
compose_prod config >/dev/null

printf 'Asegurando base de datos...\n'
compose_prod up -d db
wait_for_service compose_prod db 90

printf 'Creando respaldo previo...\n'
"$ROOT/deploy/scripts/backup.sh" prod

printf 'Construyendo imágenes...\n'
compose_prod build

printf 'Aplicando migraciones pendientes...\n'
compose_prod run --rm backend php spark migrate --all

printf 'Recreando servicios de aplicación...\n'
compose_prod up -d --remove-orphans

for service in db backend frontend nginx; do
    wait_for_service compose_prod "$service" 90
done

http_ok "$(nginx_health_url)" || die "La verificación /health falló después del despliegue."
printf '\nDespliegue completado. Los volúmenes se conservaron.\n'
printf 'Si una comprobación crítica falla, no ejecute down -v: conserve este estado para recuperación.\n'
