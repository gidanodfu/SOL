#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Concurrencia de CV: bloqueo por postulante, rate limiting y CV activo único.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_cv_concurrencia.log
fallos=0
HOLDER=""

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; [ -n "$HOLDER" ] && kill "$HOLDER" 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %-58s %s\n' "$nombre" "$real"; else printf 'FAIL %-58s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
db_scalar() {
    php -r '
$pdo = new PDO(
    "mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"),
    getenv("DB_USER"),
    getenv("DB_PASSWORD"),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
echo $pdo->query($argv[1])->fetchColumn();
' "$1"
}
retry_after() {
    awk 'tolower($1)=="retry-after:" {gsub("\r",""); print $2}' "$1" | tail -1
}

TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
POSTULANTE_ID=$(db_scalar "SELECT id FROM postulantes WHERE dni='12345678'")
USUARIO_ID=$(db_scalar "SELECT user_id FROM postulantes WHERE id=$POSTULANTE_ID")

paso "1. carga base y errores no alteran el CV activo"
curl -s -o /tmp/opencode/cv_conc_base.json -w '%{http_code}' \
    -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
    -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-conc-base.pdf" \
    > /tmp/opencode/cv_conc_base.code
check_code "carga base aceptada" 201 "$(cat /tmp/opencode/cv_conc_base.code)"

ACTIVO=$(db_scalar "SELECT cv_id FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")
CVS=$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")
curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
    -F "cv=@/var/www/sol/tests/fixtures/cv-malformado.pdf;type=application/pdf;filename=cv-conc-malo.pdf" \
    > /tmp/opencode/cv_conc_malo.code
check_code "PDF inválido rechazado" 422 "$(cat /tmp/opencode/cv_conc_malo.code)"
[ "$(db_scalar "SELECT cv_id FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")" = "$ACTIVO" ] \
    && echo 'OK   archivo inválido no cambia el CV activo' \
    || { echo 'FAIL archivo inválido cambió el CV activo'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$CVS" ] \
    && echo 'OK   archivo inválido no crea versiones' \
    || { echo 'FAIL archivo inválido creó una versión'; fallos=$((fallos + 1)); }

paso "2. una carga simultánea en curso se rechaza con 429"
cat > /tmp/opencode/cv_hold_lock.php <<'PHP'
<?php
$pdo = new PDO(
    'mysql:host=' . getenv('DB_HOST') . ';dbname=' . getenv('DB_DATABASE'),
    getenv('DB_USER'),
    getenv('DB_PASSWORD'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$st = $pdo->prepare('SELECT GET_LOCK(?, 0)');
$st->execute([$argv[1]]);
if ((int) $st->fetchColumn() !== 1) {
    fwrite(STDERR, "No se pudo adquirir el bloqueo\n");
    exit(1);
}
file_put_contents($argv[2], 'listo');
sleep(4);
$pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$argv[1]]);
PHP
rm -f /tmp/opencode/cv_lock_ready
php /tmp/opencode/cv_hold_lock.php "sol_cv_$POSTULANTE_ID" /tmp/opencode/cv_lock_ready &
HOLDER=$!
for i in $(seq 1 50); do [ -f /tmp/opencode/cv_lock_ready ] && break; sleep 0.1; done
[ -f /tmp/opencode/cv_lock_ready ] || { echo 'FAIL no se pudo simular otra carga en curso'; fallos=$((fallos + 1)); }

curl -s -D /tmp/opencode/cv_conc_lock_headers.txt -o /tmp/opencode/cv_conc_lock_body.json -w '%{http_code}' \
    -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
    -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-conc-lock.pdf" \
    > /tmp/opencode/cv_conc_lock.code
check_code "carga con bloqueo en curso rechazada" 429 "$(cat /tmp/opencode/cv_conc_lock.code)"
RETRY=$(retry_after /tmp/opencode/cv_conc_lock_headers.txt)
if [ -n "$RETRY" ] && [ "$RETRY" -ge 1 ] 2>/dev/null; then
    echo "OK   bloqueo simultáneo informa Retry-After ($RETRY s)"
else
    echo 'FAIL bloqueo simultáneo sin Retry-After'; fallos=$((fallos + 1))
fi
[ "$(db_scalar "SELECT cv_id FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")" = "$ACTIVO" ] \
    && echo 'OK   el rechazo simultáneo conserva el CV activo' \
    || { echo 'FAIL el rechazo simultáneo cambió el CV activo'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$CVS" ] \
    && echo 'OK   el rechazo simultáneo no crea versiones' \
    || { echo 'FAIL el rechazo simultáneo creó una versión'; fallos=$((fallos + 1)); }

wait "$HOLDER" 2>/dev/null
HOLDER=""
sleep 0.5
curl -s -o /tmp/opencode/cv_conc_after.json -w '%{http_code}' \
    -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
    -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-conc-after.pdf" \
    > /tmp/opencode/cv_conc_after.code
check_code "carga aceptada al liberarse el bloqueo" 201 "$(cat /tmp/opencode/cv_conc_after.code)"
CVS=$((CVS + 1))

paso "3. seis cargas simultáneas: rechazos 429 y una sola versión vigente"
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
RECHAZOS=0
for i in $(seq 1 6); do
    CODE=$(cat "/tmp/opencode/cv_conc_$i.code")
    case "$CODE" in
        201) OK=$((OK + 1)) ;;
        429) RECHAZOS=$((RECHAZOS + 1)) ;;
        *) printf 'FAIL carga concurrente %s devolvió %s\n' "$i" "$CODE" >&2; fallos=$((fallos + 1)) ;;
    esac
done
TOTAL=$((CVS + OK))
[ "$OK" -ge 1 ] && echo "OK   $OK carga(s) concurrente(s) aceptada(s)" \
    || { echo "FAIL ninguna carga concurrente fue aceptada"; fallos=$((fallos + 1)); }
[ "$RECHAZOS" -ge 1 ] && echo "OK   $RECHAZOS carga(s) concurrente(s) rechazada(s)" \
    || { echo "FAIL no hubo rechazos concurrentes"; fallos=$((fallos + 1)); }
[ $((OK + RECHAZOS)) -eq 6 ] \
    && echo 'OK   todas las respuestas concurrentes fueron 201 o 429' \
    || { echo "FAIL respuestas concurrentes incompletas: $OK aceptadas, $RECHAZOS rechazadas"; fallos=$((fallos + 1)); }

paso "4. integridad: historial, CV activo y contadores"
python3 - "$B" "$TP" <<'PY'
import json, subprocess, sys
base, token = sys.argv[1], sys.argv[2]
out = subprocess.check_output([
    'curl', '-s', base + '/api/postulante/cv', '-H', 'Authorization: Bearer ' + token,
])
data = json.loads(out)['data']
assert 'limite_mensual' not in data, data.keys()
assert data.get('vigente') is not None, data
assert sum(1 for v in data['historial'] if v['activo']) == 1, data['historial']
print('OK   API sin limite_mensual y con una sola versión activa')
PY
[ $? -eq 0 ] || { echo 'FAIL estado del CV concurrente'; fallos=$((fallos + 1)); }

[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$TOTAL" ] \
    && echo "OK   historial con $TOTAL versiones, sin registros parciales" \
    || { echo "FAIL historial distinto de $TOTAL versiones"; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID AND activo=1")" = "1" ] \
    && echo 'OK   una sola fila activa en cvs' \
    || { echo 'FAIL más de una fila activa en cvs'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")" = "1" ] \
    && echo 'OK   una sola fila en cv_activos' \
    || { echo 'FAIL cv_activos inconsistente'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(DISTINCT version) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$TOTAL" ] \
    && echo 'OK   versiones únicas y consecutivas' \
    || { echo 'FAIL versiones duplicadas'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT MAX(version) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$TOTAL" ] \
    && echo "OK   última versión coincide con $TOTAL cargas" \
    || { echo 'FAIL numeración de versiones inconsistente'; fallos=$((fallos + 1)); }

USOS_USER=$(db_scalar "SELECT COALESCE(SUM(usos),0) FROM rate_limit_contadores WHERE clave='cv:user:$USUARIO_ID:short'")
[ "$USOS_USER" = "$TOTAL" ] \
    && echo "OK   contador de usuario refleja $TOTAL cargas exitosas" \
    || { echo "FAIL contador de usuario: $USOS_USER (esperado $TOTAL)"; fallos=$((fallos + 1)); }
USOS_IP=$(db_scalar "SELECT COALESCE(SUM(usos),0) FROM rate_limit_contadores WHERE clave LIKE 'cv:ip:%:short'")
[ "$USOS_IP" = "$TOTAL" ] \
    && echo "OK   contador por IP refleja $TOTAL cargas exitosas" \
    || { echo "FAIL contador por IP: $USOS_IP (esperado $TOTAL)"; fallos=$((fallos + 1)); }

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_cv_concurrencia'
[ "$fallos" -eq 0 ] || exit 1
