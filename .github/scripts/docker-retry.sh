#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Reintenta únicamente operaciones Docker que fallen por problemas transitorios
# del registry (Docker Hub). No reintenta tests, sintaxis, Dockerfiles ni tags
# inexistentes. Uso:
#
#   . .github/scripts/docker-retry.sh
#   docker_retry docker pull mariadb:11.4.13
#   docker_retry ./deploy/scripts/dev.sh build
#
# Variables:
#   DOCKER_RETRY_ATTEMPTS  intentos totales (por defecto 3)
#   DOCKER_RETRY_DELAY     segundos base de espera (por defecto 5; 5, 10, ...)

docker_retry() {
    local retry_intentos="${DOCKER_RETRY_ATTEMPTS:-3}"
    local retry_espera="${DOCKER_RETRY_DELAY:-5}"
    local retry_patron='unexpected status from HEAD request|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|error reading from server: EOF|failed to resolve source metadata|failed to authorize:.*EOF|TLS handshake timeout|net\/http: TLS handshake timeout|connection reset by peer|i\/o timeout'
    local retry_log
    local retry_n=1
    local retry_codigo
    retry_log="$(mktemp "${TMPDIR:-/tmp}/sol-docker-retry.XXXXXX")"

    while [ "$retry_n" -le "$retry_intentos" ]; do
        "$@" >"$retry_log" 2>&1
        retry_codigo=$?
        if [ "$retry_codigo" -eq 0 ]; then
            cat "$retry_log"
            rm -f "$retry_log"
            return 0
        fi
        cat "$retry_log"
        if ! grep -Eiq "$retry_patron" "$retry_log"; then
            rm -f "$retry_log"
            return "$retry_codigo"
        fi
        if [ "$retry_n" -ge "$retry_intentos" ]; then
            printf 'Docker registry: agotados %s intentos (último código %s).\n' "$retry_intentos" "$retry_codigo" >&2
            rm -f "$retry_log"
            return "$retry_codigo"
        fi
        printf 'Docker registry: fallo transitorio; reintento %s/%s en %s s.\n' "$retry_n" "$retry_intentos" "$((retry_espera * retry_n))" >&2
        sleep "$((retry_espera * retry_n))"
        retry_n=$((retry_n + 1))
    done
}
