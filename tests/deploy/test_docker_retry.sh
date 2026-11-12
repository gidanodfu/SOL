#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Pruebas del helper de reintentos de Docker. No descarga imágenes ni modifica
# Docker: usa comandos simulados.
set -u

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
. "$ROOT/.github/scripts/docker-retry.sh"
export DOCKER_RETRY_DELAY=0

fallos=0
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sol-retry-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

# 1. 502 temporal -> reintento y éxito.
n=0
cmd_502() {
    n=$((n + 1))
    if [ "$n" -lt 2 ]; then printf 'unexpected status ... 502 Bad Gateway\n'; return 1; fi
    printf 'descarga completada\n'
}
if docker_retry cmd_502 >"$tmp/502.out" 2>&1 && [ "$n" -eq 2 ] && grep -q 'descarga completada' "$tmp/502.out"; then
    ok '502 temporal provoca reintento y termina OK'
else
    fail '502 temporal no se reintentó correctamente'
fi

# 2. EOF temporal -> reintento.
n=0
cmd_eof() {
    n=$((n + 1))
    if [ "$n" -lt 2 ]; then printf 'failed to authorize: Unavailable: error reading from server: EOF\n'; return 1; fi
    printf 'imagen disponible\n'
}
if docker_retry cmd_eof >"$tmp/eof.out" 2>&1 && [ "$n" -eq 2 ]; then
    ok 'EOF temporal provoca reintento'
else
    fail 'EOF temporal no se reintentó'
fi

# 3. Éxito al primer intento.
n=0
cmd_ok() { n=$((n + 1)); printf 'ok\n'; }
if docker_retry cmd_ok >"$tmp/ok.out" 2>&1 && [ "$n" -eq 1 ]; then
    ok 'comando exitoso termina en PASS al primer intento'
else
    fail 'comando exitoso se reintentó o falló'
fi

# 4. Error permanente: no se reintenta.
n=0
cmd_permanente() { n=$((n + 1)); printf 'Dockerfile: sintaxis inválida\n'; return 42; }
docker_retry cmd_permanente >"$tmp/permanente.out" 2>&1
codigo=$?
if [ "$codigo" -eq 42 ] && [ "$n" -eq 1 ]; then
    ok 'error permanente conserva código y no se reintenta'
else
    fail "error permanente: código=$codigo intentos=$n"
fi

# 5. Tres fallos transitorios -> FAIL tras tres intentos.
n=0
cmd_siempre_502() { n=$((n + 1)); printf '504 Gateway Timeout\n'; return 7; }
docker_retry cmd_siempre_502 >"$tmp/tres.out" 2>&1
codigo=$?
if [ "$codigo" -eq 7 ] && [ "$n" -eq 3 ]; then
    ok 'tres fallos transitorios terminan en FAIL con el código real'
else
    fail "tres fallos: código=$codigo intentos=$n"
fi

# 6. Salida original preservada.
n=0
cmd_salida() { n=$((n + 1)); printf 'mensaje-original\n'; return 37; }
docker_retry cmd_salida >"$tmp/salida.out" 2>&1
codigo=$?
if [ "$codigo" -eq 37 ] && [ "$n" -eq 1 ] && grep -q 'mensaje-original' "$tmp/salida.out"; then
    ok 'se preserva stdout/stderr y el código de retorno'
else
    fail 'no se preservó la salida o el código'
fi

if [ "$fallos" -ne 0 ]; then
    printf '\nAserción fallida: %s\n' "$fallos" >&2
    exit 1
fi
printf '\nDocker retry: todas las comprobaciones pasaron.\n'
