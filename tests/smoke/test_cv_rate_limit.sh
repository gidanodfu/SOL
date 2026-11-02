#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Rate limiting de CV: rechazo 429, Retry-After y reinicio de ventana.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8081
LOG=/tmp/opencode/spark_cv_rate_limit.log
fallos=0

# Ventanas cortas para poder observar el reinicio sin esperar 10 minutos.
env 'storage.driver=local' \
    'cvRateLimit.userShortLimit=2' \
    'cvRateLimit.userShortWindow=3' \
    'cvRateLimit.userLongLimit=3' \
    'cvRateLimit.userLongWindow=3600' \
    'cvRateLimit.ipShortLimit=100' \
    'cvRateLimit.ipShortWindow=60' \
    'cvRateLimit.ipLongLimit=100' \
    'cvRateLimit.ipLongWindow=3600' \
    php spark serve --host 127.0.0.1 --port 8081 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

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
cargar() {
    curl -s -D "$1" -o "$2" -w '%{http_code}' \
        -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" \
        -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=$3"
}
alinear_ventana() {
    AHORA=$(date +%s)
    # Esperar siempre al siguiente límite de 3 s (aunque el segundo actual
    # parezca exacto) y añadir margen para evitar el borde de la ventana.
    sleep $(( 3 - AHORA % 3 ))
    sleep 0.3
}

TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
POSTULANTE_ID=$(db_scalar "SELECT id FROM postulantes WHERE dni='12345678'")
USUARIO_ID=$(db_scalar "SELECT user_id FROM postulantes WHERE id=$POSTULANTE_ID")

paso "1. dos cargas permitidas y tercera rechazada por ventana corta"
alinear_ventana
CODE=$(cargar /tmp/opencode/cv_rl_1_headers.txt /tmp/opencode/cv_rl_1.json cv-rl-1.pdf)
check_code "primera carga permitida" 201 "$CODE"
CODE=$(cargar /tmp/opencode/cv_rl_2_headers.txt /tmp/opencode/cv_rl_2.json cv-rl-2.pdf)
check_code "segunda carga permitida" 201 "$CODE"

ACTIVO=$(db_scalar "SELECT cv_id FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")
CVS=$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")
CODE=$(cargar /tmp/opencode/cv_rl_3_headers.txt /tmp/opencode/cv_rl_3.json cv-rl-3.pdf)
check_code "tercera carga rechazada por rate limit" 429 "$CODE"
RETRY=$(retry_after /tmp/opencode/cv_rl_3_headers.txt)
if [ -n "$RETRY" ] && [ "$RETRY" -ge 1 ] 2>/dev/null && [ "$RETRY" -le 3 ]; then
    echo "OK   Retry-After de ventana corta ($RETRY s)"
else
    echo "FAIL Retry-After de ventana corta inválido: '$RETRY'"; fallos=$((fallos + 1))
fi
[ "$(db_scalar "SELECT cv_id FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")" = "$ACTIVO" ] \
    && echo 'OK   el 429 conserva el CV activo' \
    || { echo 'FAIL el 429 cambió el CV activo'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "$CVS" ] \
    && echo 'OK   el 429 no crea versiones' \
    || { echo 'FAIL el 429 creó una versión'; fallos=$((fallos + 1)); }

paso "2. la ventana se reinicia y permite una nueva carga"
alinear_ventana
CODE=$(cargar /tmp/opencode/cv_rl_4_headers.txt /tmp/opencode/cv_rl_4.json cv-rl-4.pdf)
check_code "cuarta carga tras reinicio de ventana" 201 "$CODE"

paso "3. ventana larga sigue bloqueando aunque la corta se haya reiniciado"
CODE=$(cargar /tmp/opencode/cv_rl_5_headers.txt /tmp/opencode/cv_rl_5.json cv-rl-5.pdf)
check_code "quinta carga rechazada por ventana larga" 429 "$CODE"
RETRY=$(retry_after /tmp/opencode/cv_rl_5_headers.txt)
if [ -n "$RETRY" ] && [ "$RETRY" -gt 3 ] 2>/dev/null; then
    echo "OK   Retry-After de ventana larga ($RETRY s)"
else
    echo "FAIL Retry-After de ventana larga inválido: '$RETRY'"; fallos=$((fallos + 1))
fi

paso "4. estado final, cuota retirada y contadores"
curl -s "$B/api/postulante/cv" -H "Authorization: Bearer $TP" > /tmp/opencode/cv_rl_state.json
python3 - /tmp/opencode/cv_rl_state.json <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
data = d['data']
assert 'limite_mensual' not in data, data.keys()
assert data.get('vigente') is not None, data
assert len(data.get('historial', [])) == 3, len(data.get('historial', []))
assert sum(1 for v in data['historial'] if v['activo']) == 1, data['historial']
print('OK   tres versiones y un único CV activo sin cuota mensual')
PY
[ $? -eq 0 ] || { echo 'FAIL estado final de CV'; fallos=$((fallos + 1)); }

[ "$(db_scalar "SELECT COUNT(*) FROM cvs WHERE postulante_id=$POSTULANTE_ID")" = "3" ] \
    && echo 'OK   sin registros parciales de las cargas rechazadas' \
    || { echo 'FAIL registros parciales de CV'; fallos=$((fallos + 1)); }
[ "$(db_scalar "SELECT COUNT(*) FROM cv_activos WHERE postulante_id=$POSTULANTE_ID")" = "1" ] \
    && echo 'OK   una sola fila en cv_activos' \
    || { echo 'FAIL cv_activos inconsistente'; fallos=$((fallos + 1)); }

TABLA_LEGADO=$(db_scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='cv_cuotas_mensuales_legado'")
TABLA_CUOTA=$(db_scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='cv_cuotas_mensuales'")
TABLA_RATE=$(db_scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='rate_limit_contadores'")
[ "$TABLA_LEGADO" = "1" ] && [ "$TABLA_CUOTA" = "0" ] && [ "$TABLA_RATE" = "1" ] \
    && echo 'OK   cuota histórica en legado y tabla de rate limiting presente' \
    || { echo "FAIL migración de cuota/rate limit ($TABLA_LEGADO/$TABLA_CUOTA/$TABLA_RATE)"; fallos=$((fallos + 1)); }

USOS_IP=$(db_scalar "SELECT COALESCE(SUM(usos),0) FROM rate_limit_contadores WHERE clave LIKE 'cv:ip:%:short'")
[ "$USOS_IP" = "3" ] \
    && echo 'OK   contador por IP refleja las tres cargas exitosas' \
    || { echo "FAIL contador por IP: $USOS_IP (esperado 3)"; fallos=$((fallos + 1)); }
USOS_USER_LARGO=$(db_scalar "SELECT COALESCE(SUM(usos),0) FROM rate_limit_contadores WHERE clave='cv:user:$USUARIO_ID:long'")
[ "$USOS_USER_LARGO" = "3" ] \
    && echo 'OK   contador largo de usuario refleja las tres cargas exitosas' \
    || { echo "FAIL contador largo de usuario: $USOS_USER_LARGO (esperado 3)"; fallos=$((fallos + 1)); }

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_cv_rate_limit'
[ "$fallos" -eq 0 ] || exit 1
