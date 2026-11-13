#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Pruebas del helper de reintentos de Docker. No descarga imágenes ni modifica
# Docker: usa comandos simulados y ejecuta el helper bajo set -euo pipefail.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
. "$ROOT/.github/scripts/docker-retry.sh"
export DOCKER_RETRY_DELAY=0

fallos=0
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sol-retry-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }
contiene() { printf '%s\n' "$1" | grep -q "$2"; }
no_contiene() { ! printf '%s\n' "$1" | grep -q "$2"; }

# Ejecuta un cuerpo en un shell estricto real. TMPDIR apunta al directorio de
# la prueba para comprobar que el helper no deja logs temporales.
run_estricto() {
    TMPDIR="$tmp" bash -euo pipefail -c \
        ". '$ROOT/.github/scripts/docker-retry.sh'; export DOCKER_RETRY_DELAY=0; $1"
}

# 1. 502 temporal -> reintento y éxito desde una invocación directa bajo strict mode.
if salida=$(run_estricto '
n=0
cmd() {
    n=$((n + 1))
    if [ "$n" -lt 2 ]; then printf "unexpected status ... 502 Bad Gateway\n"; return 1; fi
    printf "descarga completada\n"
}
docker_retry cmd
printf "intentos=%s\n" "$n"
' 2>&1); then
    if contiene "$salida" 'intentos=2' && contiene "$salida" 'descarga completada'; then
        ok '502 temporal provoca reintento y termina OK bajo set -euo pipefail'
    else
        fail '502 temporal no se reintentó correctamente bajo strict mode'
    fi
else
    fail 'la invocación directa bajo set -euo pipefail terminó antes del reintento'
fi

# 2. EOF temporal -> reintento.
if salida=$(run_estricto '
n=0
cmd() {
    n=$((n + 1))
    if [ "$n" -lt 2 ]; then printf "failed to authorize: Unavailable: error reading from server: EOF\n"; return 1; fi
    printf "imagen disponible\n"
}
docker_retry cmd
printf "intentos=%s\n" "$n"
' 2>&1); then
    if contiene "$salida" 'intentos=2'; then
        ok 'EOF temporal provoca reintento bajo set -euo pipefail'
    else
        fail 'EOF temporal no se reintentó'
    fi
else
    fail 'EOF temporal terminó el shell antes del reintento'
fi

# 3. Dos fallos transitorios y éxito en el tercer intento.
if salida=$(run_estricto '
n=0
cmd() {
    n=$((n + 1))
    if [ "$n" -lt 3 ]; then printf "503 Service Unavailable\n"; return 1; fi
    printf "tercer intento OK\n"
}
docker_retry cmd
printf "intentos=%s\n" "$n"
' 2>&1); then
    if contiene "$salida" 'intentos=3' && contiene "$salida" 'tercer intento OK'; then
        ok 'dos fallos transitorios permiten el tercer intento exitoso'
    else
        fail 'no se alcanzó el tercer intento exitoso'
    fi
else
    fail 'el tercer intento exitoso terminó en fallo'
fi

# 4. Tres fallos transitorios terminan en FAIL con el código real.
rm -f "$tmp/intentos"
if salida=$(run_estricto '
n=0
cmd() { n=$((n + 1)); printf "%s" "$n" > "$TMPDIR/intentos"; printf "504 Gateway Timeout\n"; return 7; }
docker_retry cmd
' 2>&1); then
    codigo=0
else
    codigo=$?
fi
intentos=$(cat "$tmp/intentos")
if [ "$codigo" -eq 7 ] && [ "$intentos" -eq 3 ] && contiene "$salida" 'agotados 3 intentos'; then
    ok 'tres fallos transitorios terminan en FAIL con el código real'
else
    fail "tres fallos: código=$codigo intentos=$intentos"
fi

# 5. Error permanente: no se reintenta.
rm -f "$tmp/intentos"
if salida=$(run_estricto '
n=0
cmd() { n=$((n + 1)); printf "%s" "$n" > "$TMPDIR/intentos"; printf "Dockerfile: sintaxis inválida\n"; return 42; }
docker_retry cmd
' 2>&1); then
    codigo=0
else
    codigo=$?
fi
intentos=$(cat "$tmp/intentos")
if [ "$codigo" -eq 42 ] && [ "$intentos" -eq 1 ] && no_contiene "$salida" 'reintento'; then
    ok 'error permanente conserva código y no se reintenta'
else
    fail "error permanente: código=$codigo intentos=$intentos"
fi

# 6. Salida original preservada (stdout y stderr combinados por el helper).
if salida=$(run_estricto '
n=0
cmd() {
    n=$((n + 1))
    printf "mensaje-original\n"
    printf "error-original\n" >&2
    return 37
}
docker_retry cmd
' 2>&1); then
    codigo=0
else
    codigo=$?
fi
if [ "$codigo" -eq 37 ] && contiene "$salida" 'mensaje-original' && contiene "$salida" 'error-original'; then
    ok 'se preserva stdout/stderr y el código de retorno'
else
    fail 'no se preservó la salida o el código'
fi

# 7. El helper funciona dentro de un bloque condicional bajo strict mode.
if salida=$(run_estricto '
n=0
cmd() {
    n=$((n + 1))
    if [ "$n" -lt 2 ]; then printf "502 Bad Gateway\n"; return 1; fi
    printf "ok\n"
}
if docker_retry cmd; then printf "condicional=ok\n"; else printf "condicional=fallo\n"; fi
printf "intentos=%s\n" "$n"
' 2>&1); then
    if contiene "$salida" 'condicional=ok' && contiene "$salida" 'intentos=2'; then
        ok 'el helper funciona dentro de un bloque condicional'
    else
        fail 'el helper falló dentro de un bloque condicional'
    fi
else
    fail 'el bloque condicional terminó el shell'
fi

# 8. No se dejan archivos temporales en TMPDIR.
if find "$tmp" -maxdepth 1 -name 'sol-docker-retry.*' -print -quit | grep -q .; then
    fail 'quedaron archivos temporales del helper'
else
    ok 'no quedan archivos temporales del helper'
fi

if [ "$fallos" -ne 0 ]; then
    printf '\nAserción fallida: %s\n' "$fallos" >&2
    exit 1
fi
printf '\nDocker retry: todas las comprobaciones pasaron.\n'
