#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Límite mensual de CV y CV activo único ante solicitudes simultáneas.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_cv_concurrencia.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %-58s %s\n' "$nombre" "$real"; else printf 'FAIL %-58s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}

TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

paso "1. seis cargas simultáneas: exactamente cuatro exitosas"
rm -f /tmp/opencode/cv_conc_*.code /tmp/opencode/cv_conc_*.json
PIDS=""
for i in $(seq 1 6); do
    curl -s -o "/tmp/opencode/cv_conc_$i.json" -w '%{http_code}' \
        -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
        -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-concurrente-$i.pdf" \
        > "/tmp/opencode/cv_conc_$i.code" &
    PIDS="$PIDS $!"
done
for pid in $PIDS; do
    wait "$pid"
done

OK=0
LIMITE=0
for i in $(seq 1 6); do
    CODE=$(cat "/tmp/opencode/cv_conc_$i.code")
    case "$CODE" in
        201) OK=$((OK + 1)) ;;
        409) LIMITE=$((LIMITE + 1)) ;;
        *) printf 'FAIL carga concurrente %s devolvió %s\n' "$i" "$CODE" >&2; fallos=$((fallos + 1)) ;;
    esac
done
[ "$OK" -eq 4 ] && echo 'OK   4 cargas aceptadas' || { echo "FAIL cargas aceptadas: $OK (esperado 4)"; fallos=$((fallos + 1)); }
[ "$LIMITE" -eq 2 ] && echo 'OK   2 cargas rechazadas por cuota' || { echo "FAIL rechazos por cuota: $LIMITE (esperado 2)"; fallos=$((fallos + 1)); }

paso "2. cuota persistida y un único CV vigente"
curl -s "$B/api/postulante/cv" -H "Authorization: Bearer $TP" > /tmp/opencode/cv_conc_estado.json
python3 - /tmp/opencode/cv_conc_estado.json <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
data = d['data']
assert data['limite_mensual']['usados'] == 4, data['limite_mensual']
assert data['limite_mensual']['restantes'] == 0, data['limite_mensual']
assert data.get('vigente') is not None, data
assert len(data.get('historial', [])) == 4, len(data.get('historial', []))
print('OK   cuota 4/4 e historial de cuatro versiones')
PY
[ $? -eq 0 ] || { echo 'FAIL estado de cuota/CV concurrente'; fallos=$((fallos + 1)); }

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_cv_concurrencia'
[ "$fallos" -eq 0 ] || exit 1
