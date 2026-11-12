#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Benchmark aislado: crece el número de ofertas y comprueba que el listado de
# la empresa no dispare una consulta por oferta. Usa la base temporal del
# runner de smoke; no toca datos persistentes.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/perf-spark.log

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

php /var/www/sol/tests/tools/perf_benchmark.php --assert --muestras=30
bench=$?

# Cache stampede: 10 lectores simultáneos de una imagen con caché vacía deben
# provocar una sola descarga externa.
php /var/www/sol/tests/tools/image_cache_stampede.php --hijos=10 --expect=1
cache=$?

[ "$bench" -eq 0 ] && [ "$cache" -eq 0 ]
