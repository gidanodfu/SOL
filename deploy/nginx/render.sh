#!/bin/sh
set -eu

mode="${NGINX_MODE:-same-domain}"
if [ -z "${APP_DOMAIN:-}" ]; then
    echo "Falta APP_DOMAIN para renderizar Nginx." >&2
    exit 1
fi
if [ "$mode" = "http" ]; then
    # Bajo Traefik el TLS termina en el proxy. El modo de dominios se deriva
    # de si la API comparte host con el frontend.
    if [ -z "${API_DOMAIN:-}" ]; then
        echo "Falta API_DOMAIN para el modo http." >&2
        exit 1
    fi
    if [ -z "${TRAEFIK_ENTRY_IP:-}" ]; then
        echo "Falta TRAEFIK_ENTRY_IP para limitar la confianza de X-Forwarded-*." >&2
        exit 1
    fi
    if [ "$APP_DOMAIN" = "$API_DOMAIN" ]; then
        template="app.http.conf.template"
    else
        template="app.http.subdomain.conf.template"
    fi
else
    case "$mode" in
        same-domain|https) template="app.https.same-domain.conf.template" ;;
        subdomain) template="app.https.subdomain.conf.template" ;;
        *)
            echo "NGINX_MODE inválido: $mode (use http, same-domain o subdomain)" >&2
            exit 1
            ;;
    esac
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
envsubst '${APP_DOMAIN} ${API_DOMAIN} ${TRAEFIK_ENTRY_IP} ${TLS_CERT_PATH} ${TLS_KEY_PATH}' \
    < "/etc/nginx/templates-sol/$template" \
    > /etc/nginx/conf.d/default.conf
