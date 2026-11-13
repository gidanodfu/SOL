#!/bin/sh
# SPDX-License-Identifier: MIT
# Verifica que bootstrap.sh use el helper compartido de reintentos Docker y que
# SystemSeeder siga limitado al bootstrap autorizado.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BOOTSTRAP="$ROOT/deploy/scripts/bootstrap.sh"
DEV="$ROOT/deploy/scripts/dev.sh"

fallos=0
ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

if grep -Fq '.github/scripts/docker-retry.sh' "$BOOTSTRAP"; then
    ok 'bootstrap carga el helper compartido de reintentos'
else
    fail 'bootstrap no carga .github/scripts/docker-retry.sh'
fi

for operacion in 'docker_retry compose_dev up -d db' 'docker_retry compose_dev build' 'docker_retry compose_dev up -d'; do
    if grep -Fq "$operacion" "$BOOTSTRAP"; then
        ok "bootstrap reintenta: $operacion"
    else
        fail "bootstrap no reintenta: $operacion"
    fi
done

if grep -Fq 'SystemSeeder solo se ejecuta mediante bootstrap.sh' "$DEV"; then
    ok 'dev.sh mantiene bloqueado SystemSeeder'
else
    fail 'dev.sh permite SystemSeeder fuera del bootstrap'
fi

if [ "$fallos" -ne 0 ]; then
    printf '\nAserción fallida: %s\n' "$fallos" >&2
    exit 1
fi
printf '\nBootstrap: todas las comprobaciones pasaron.\n'
