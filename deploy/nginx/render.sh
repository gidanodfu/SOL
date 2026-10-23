#!/bin/sh
set -eu

mode="${NGINX_MODE:-same-domain}"
case "$mode" in
    http) template="app.http.conf.template" ;;
    same-domain|https) template="app.https.same-domain.conf.template" ;;
    subdomain) template="app.https.subdomain.conf.template" ;;
    *)
        echo "NGINX_MODE inválido: $mode (use http, same-domain o subdomain)" >&2
        exit 1
        ;;
esac

if [ -z "${APP_DOMAIN:-}" ]; then
    echo "Falta APP_DOMAIN para renderizar Nginx." >&2
    exit 1
fi
if [ "$mode" != "http" ] && { [ ! -f "${TLS_CERT_PATH:-/nonexistent}" ] || [ ! -f "${TLS_KEY_PATH:-/nonexistent}" ]; }; then
    echo "Faltan el certificado o la clave para el modo HTTPS. Revise .env y deploy/nginx/certs/." >&2
    exit 1
fi
if [ "$mode" = "subdomain" ] && [ -z "${API_DOMAIN:-}" ]; then
    echo "Falta API_DOMAIN para el modo subdomain." >&2
    exit 1
fi

mkdir -p /etc/nginx/conf.d
envsubst '${APP_DOMAIN} ${API_DOMAIN} ${TLS_CERT_PATH} ${TLS_KEY_PATH}' \
    < "/etc/nginx/templates-sol/$template" \
    > /etc/nginx/conf.d/default.conf
