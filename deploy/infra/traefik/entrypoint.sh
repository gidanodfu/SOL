#!/bin/sh
# Renderiza la plantilla estática de Traefik con las variables del entorno.
# Se ejecuta dentro del contenedor; no imprime el correo ni otros valores.
set -eu

: "${ACME_EMAIL:?Defina ACME_EMAIL en deploy/infra/traefik/.env}"
: "${ACME_CA_SERVER:?Defina ACME_CA_SERVER en deploy/infra/traefik/.env}"
: "${PROXY_NETWORK:?Defina PROXY_NETWORK en deploy/infra/traefik/.env}"

case "$ACME_EMAIL" in
    *@*.*) ;;
    *) echo "ERROR: ACME_EMAIL no tiene un formato de correo válido." >&2; exit 1 ;;
esac

case "$ACME_CA_SERVER" in
    http://*|https://*) ;;
    *) echo "ERROR: ACME_CA_SERVER debe ser una URL http(s)." >&2; exit 1 ;;
esac

umask 077
sed \
    -e "s|__ACME_EMAIL__|$ACME_EMAIL|g" \
    -e "s|__ACME_CA_SERVER__|$ACME_CA_SERVER|g" \
    -e "s|__PROXY_NETWORK__|$PROXY_NETWORK|g" \
    /etc/traefik/traefik.yml.template > /tmp/traefik.rendered.yml

exec traefik "$@"
