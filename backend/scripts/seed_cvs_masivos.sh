#!/usr/bin/env bash
# Genera y sube los CV ficticios del dataset masivo usando el flujo real de la API.
#
# Requisitos previos (ver DatosMasivosSeeder):
#   cd backend && php spark migrate:refresh --all -f && php spark db:seed SystemSeeder
#   php spark db:seed DatosMasivosSeeder
#
# Uso:
#   bash scripts/seed_cvs_masivos.sh          # levanta la API en :8080 si hace falta
#   B=http://localhost:8090 bash scripts/seed_cvs_masivos.sh   # API ya corriendo en otro puerto
set -u
cd "$(dirname "$0")/.." || exit 1

B="${B:-http://127.0.0.1:8080}"
PORT="${B##*:}"
TMP_LOG=/tmp/opencode/spark_cv_seed.log

if ! curl -s -o /dev/null "$B/"; then
  echo "Levantando API temporal en $B ..."
  php spark serve --port "$PORT" > "$TMP_LOG" 2>&1 &
  SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT
  for i in $(seq 1 25); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done
fi

python3 scripts/cvs_masivos.py "$B"
