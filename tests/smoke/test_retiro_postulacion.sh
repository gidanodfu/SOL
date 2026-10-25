#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Retiro voluntario del postulante: la empresa no puede reactivar ese mismo
# registro, pero sí puede reactivar otras desactivaciones y el postulante puede
# crear una nueva postulación independiente.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_retiro_postulacion.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then ok "$nombre ($real)"; else fail "$nombre ($real, esperado $esperado)"; fi
}

tok() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "login sin access_token";print(d["data"]["access_token"])'
}

id_json() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data"), "respuesta sin data";print(d["data"]["id"])'
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

printf '\n== 1. el postulante retira voluntariamente la postulación 1 ==\n'
check_code 'retiro del postulante' 200 "$(curl -s -o /tmp/opencode/retiro_1.json -w '%{http_code}' -X PUT "$B/api/postulante/postulaciones/1/retirar" -H "Authorization: Bearer $TP")"
curl -s "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE" > /tmp/opencode/retiro_detalle_1.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/opencode/retiro_detalle_1.json'))['data']
assert d['activo'] == 0, d
assert d['retirada_postulante'] == 1, d
assert d['estado'] == 'pendiente', d
print('marca de retiro persistida OK')
PY

ESTADO_ANTES=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/retiro_detalle_1.json"))["data"]["estado"])')
HIST_ANTES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo (int) $pdo->query("SELECT COUNT(*) FROM postulacion_historial WHERE postulacion_id = 1")->fetchColumn();
')
UPDATED_ANTES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo (string) $pdo->query("SELECT updated_at FROM postulaciones WHERE id = 1")->fetchColumn();
')

printf '\n== 2. la empresa no puede reactivar el mismo registro ==\n'
code=$(curl -s -o /tmp/opencode/retiro_activacion.json -w '%{http_code}' \
    -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d '{"activo":true}')
check_code 'reactivación rechazada' 409 "$code"
python3 - <<'PY'
import json
d = json.load(open('/tmp/opencode/retiro_activacion.json'))
assert d.get('success') is False, d
assert 'retirada por el postulante' in d.get('message', '').lower(), d
print('mensaje de bloqueo OK')
PY

curl -s "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE" > /tmp/opencode/retiro_detalle_2.json
python3 - <<PY
import json
d = json.load(open('/tmp/opencode/retiro_detalle_2.json'))['data']
assert d['activo'] == 0, d
assert d['retirada_postulante'] == 1, d
assert d['estado'] == '${ESTADO_ANTES}', d
print('estado y actividad intactos tras el rechazo OK')
PY

HIST_DESPUES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo (int) $pdo->query("SELECT COUNT(*) FROM postulacion_historial WHERE postulacion_id = 1")->fetchColumn();
')
UPDATED_DESPUES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo (string) $pdo->query("SELECT updated_at FROM postulaciones WHERE id = 1")->fetchColumn();
')
if [ "$HIST_ANTES" = "$HIST_DESPUES" ] && [ "$UPDATED_ANTES" = "$UPDATED_DESPUES" ]; then
    ok 'el intento rechazado no alteró historial ni updated_at'
else
    fail "historial $HIST_ANTES→$HIST_DESPUES, updated_at $UPDATED_ANTES→$UPDATED_DESPUES"
fi

check_code 'cambio de estado rechazado' 409 "$(curl -s -o /tmp/opencode/retiro_estado.json -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}')"

printf '\n== 3. otra empresa no accede al registro ==\n'
CREATE_B=$(curl -s -o /tmp/opencode/retiro_empresa_b.json -w '%{http_code}' -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"ruc":"20605555555","razon_social":"Empresa Retiro B SAC","evaluacion_presencial":true,"password":"Retiro12345!"}')
check_code 'crear empresa B' 201 "$CREATE_B"
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20605555555","password":"Retiro12345!"}' | tok)
check_code 'empresa B no puede reactivar la postulación ajena' 404 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"activo":true}')"

printf '\n== 4. nueva postulación independiente y desactivación de la empresa ==\n'
check_code 'completar perfil del postulante' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/postulante/perfil" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' \
    -d '{"nombres":"Ana","apellidos":"Torres Rojas","email":"ana.torres@mail.com","telefono":"987654321","direccion":"Av. Chiclayo 100","distrito":"José Leonardo Ortiz","fecha_nacimiento":"1990-01-15","tipo_documento":"DNI","numero_documento":"12345678"}')"
check_code 'cargar CV' 201 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" \
    -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-retiro.pdf")"

code=$(curl -s -o /tmp/opencode/retiro_nueva_postulacion.json -w '%{http_code}' \
    -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" \
    -H 'Content-Type: application/json' -d '{"oferta_id":1}')
check_code 'nueva postulación a la misma oferta' 201 "$code"
NUEVA_ID=$(id_json < /tmp/opencode/retiro_nueva_postulacion.json)

check_code 'empresa desactiva la nueva postulación' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$NUEVA_ID/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":false}')"
check_code 'empresa reactiva una desactivación propia' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$NUEVA_ID/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":true}')"
curl -s "$B/api/empresa/postulaciones/$NUEVA_ID" -H "Authorization: Bearer $TE" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];assert d["activo"]==1;assert d["retirada_postulante"]==0;print("reactivación permitida sin marca de retiro OK")'

printf '\nFIN retiro de postulación\n'
[ "$fallos" -eq 0 ] || exit 1
