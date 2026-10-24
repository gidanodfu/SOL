#!/bin/sh
set -eu

. "$(dirname -- "$0")/lib/common.sh"

trap 'code=$?; if [ "$code" -ne 0 ]; then
    printf "\nDespliegue detenido (código %s). No se restauró nada automáticamente.\n" "$code" >&2
    printf "Diagnóstico: revise el estado con docker compose -p %s ps y los logs del servicio afectado.\n" "$(project_name)" >&2
    printf "Conserve el respaldo previo y no ejecute down -v.\n" >&2
fi' EXIT

case "${1:-}" in
    -h|--help)
        cat <<'USAGE'
Uso: deploy/scripts/deploy.sh

Actualiza una instalación de producción existente. Requiere:
  - CI_ENVIRONMENT=production en el .env activo.
  - COMPOSE_PROJECT_NAME distinto de sol_dev.
  - La red exclusiva de entrada Traefik ↔ SOL y Traefik en ejecución.
  - NGINX_MODE=http; el TLS termina en Traefik.
  - Una base ya inicializada con usuarios.

Pasos: valida configuración, exige la red de entrada exclusiva y Traefik en
ejecución, arranca/verifica MySQL, exige base inicializada, crea un respaldo
verificado, construye imágenes, aplica migraciones, recrea servicios, espera
salud y comprueba /health. No ejecuta seeders, no restaura datos y no elimina
volúmenes.
USAGE
        exit 0
        ;;
    '') ;;
    *) die "Opción desconocida: $1" ;;
esac

require_repo
docker_available
validate_env_basics
require_prod_project
require_env APP_DOMAIN "Defina el dominio público del frontend."
assert_compose_project compose_prod
require_sol_entry_network
require_traefik_entry

[ "$(env_get NGINX_MODE)" = "http" ] || die "Detrás de Traefik, NGINX_MODE debe ser http; el TLS termina en Traefik."
printf 'Red de entrada exclusiva: %s (Traefik en %s)\n' "$(sol_entry_network)" "$(env_get TRAEFIK_ENTRY_IP)"

printf 'Entorno de destino: producción\n'
printf 'Proyecto Compose: %s\n' "$(project_name)"
printf 'Dominio: %s\n' "$(env_get APP_DOMAIN)"

printf 'Validando configuración Compose...\n'
compose_prod config -q

printf 'Asegurando base de datos...\n'
compose_prod up -d db
wait_for_service compose_prod db 90

printf 'Verificando que la base esté inicializada...\n'
TABLES=$(compose_prod exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'users';
SQL
) || die "No se pudo consultar la base de datos. Revise el servicio db."
TABLES=$(printf '%s' "$TABLES" | tr -d '[:space:]')
[ "${TABLES:-0}" = "1" ] || die "La base no está inicializada. Use bootstrap.sh --prod --authorize en una instalación nueva; deploy.sh no crea la instalación inicial."

USERS=$(compose_prod exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N "$MYSQL_DATABASE"' <<'SQL'
SELECT COUNT(*) FROM users;
SQL
) || die "No se pudo contar los usuarios de la base."
USERS=$(printf '%s' "$USERS" | tr -d '[:space:]')
[ "${USERS:-0}" -gt 0 ] || die "La base no contiene usuarios. Use bootstrap.sh --prod --authorize para una instalación nueva."

printf 'Creando respaldo previo verificado...\n'
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
printf '\nDespliegue completado correctamente.\n'
printf 'Proyecto: %s\n' "$(project_name)"
printf 'Frontend: %s\n' "$(env_get APP_URL)"
printf 'Los volúmenes se conservaron. Si una comprobación crítica falla, no ejecute down -v.\n'
