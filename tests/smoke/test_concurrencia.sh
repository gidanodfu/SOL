#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Prueba de concurrencia real: usa dos procesos `spark serve` sobre el mismo
# MySQL temporal para que las peticiones no estén serializadas por un único
# servidor PHP. Verifica duplicados y la carrera selección vs nueva postulación.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
B2=http://127.0.0.1:8081
LOG=/tmp/opencode/spark-concurrencia-1.log
LOG2=/tmp/opencode/spark-concurrencia-2.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 --port 8080 > "$LOG" 2>&1 &
SRV=$!
env 'storage.driver=local' php spark serve --host 127.0.0.1 --port 8081 > "$LOG2" 2>&1 &
SRV2=$!
trap 'kill "$SRV" "$SRV2" 2>/dev/null' EXIT
for _ in $(seq 1 30); do
    curl -s -o /dev/null "$B/" && curl -s -o /dev/null "$B2/" && break
    sleep 0.3
done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

tok() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "login/registro sin access_token";print(d["data"]["access_token"])'
}

id_json() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data"), "respuesta sin data";print(d["data"]["id"])'
}

crear_oferta() {
    token="$1"; puesto="$2"; cierre="$3"
    curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "{\"puesto\":\"$puesto\",\"vacantes\":1,\"descripcion\":\"Descripción de concurrencia\",\"funciones\":\"Funciones de concurrencia\",\"fecha_cierre\":\"$cierre\"}"
}

aprobar_oferta() {
    token="$1"; id="$2"
    curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/$id/aprobar" \
        -H "Authorization: Bearer $token"
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
FUTURO=$(php -r 'echo date("Y-m-d", strtotime("+30 days"));')

printf '\n== preparación de candidato aislado ==\n'
REG=$(curl -s -X POST "$B/api/registro/postulante" -H 'Content-Type: application/json' \
    -d '{"dni":"87654321","nombres":"Carla","apellidos":"Concurrente","email":"concurrencia@mail.com","telefono":"999888777","password":"Concur12345!","password2":"Concur12345!","terms_accepted":true}')
TP=$(printf '%s' "$REG" | tok)
ok 'registro de candidato concurrente'

PERFIL=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/postulante/perfil" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' \
    -d '{"nombres":"Carla","apellidos":"Concurrente","email":"concurrencia@mail.com","telefono":"999888777","direccion":"Av. Concurrencia 123","distrito":"Chiclayo","fecha_nacimiento":"1992-03-20","tipo_documento":"DNI","numero_documento":"87654321"}')
if [ "$PERFIL" = "200" ]; then ok 'perfil completo para concurrencia'; else fail "perfil de concurrencia ($PERFIL)"; fi

CV=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" \
    -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-concurrencia.pdf")
if [ "$CV" = "201" ]; then ok 'CV cargado para concurrencia'; else fail "CV de concurrencia ($CV)"; fi

X=$(crear_oferta "$TE" "Oferta X concurrencia" "$FUTURO" | id_json)
Y=$(crear_oferta "$TE" "Oferta Y concurrencia" "$FUTURO" | id_json)
Z=$(crear_oferta "$TE" "Oferta Z concurrencia" "$FUTURO" | id_json)
for id_oferta in "$X" "$Y" "$Z"; do
    code=$(aprobar_oferta "$TA" "$id_oferta")
    [ "$code" = "200" ] || fail "aprobar oferta $id_oferta ($code)"
done

# Postulación base a X, necesaria para poder seleccionar al candidato.
PX=$(curl -s -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" \
    -H 'Content-Type: application/json' -d "{\"oferta_id\":$X}" | id_json)
CODE_X=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$PX/estado" \
    -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}')
[ "$CODE_X" = "200" ] || fail "preparar postulación X para selección ($CODE_X)"

printf '\n== duplicado simultáneo de la misma oferta ==\n'
C1=/tmp/opencode/concurrencia-duplicado-1.code
C2=/tmp/opencode/concurrencia-duplicado-2.code
DB1=/tmp/opencode/concurrencia-duplicado-1.json
DB2=/tmp/opencode/concurrencia-duplicado-2.json
curl -s -o "$DB1" -w '%{http_code}' -X POST "$B/api/postulante/postulaciones" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$Y}" > "$C1" &
PID1=$!
curl -s -o "$DB2" -w '%{http_code}' -X POST "$B2/api/postulante/postulaciones" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$Y}" > "$C2" &
PID2=$!
wait "$PID1" "$PID2"
R1=$(cat "$C1"); R2=$(cat "$C2")
if { [ "$R1" = "201" ] && [ "$R2" = "409" ]; } || { [ "$R1" = "409" ] && [ "$R2" = "201" ]; }; then
    ok "concurrencia misma oferta: un 201 y un 409 ($R1/$R2)"
else
    fail "concurrencia misma oferta devolvió $R1/$R2"
fi
DUP=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT COUNT(*) FROM postulaciones p JOIN postulantes po ON po.id=p.postulante_id WHERE po.dni=\"87654321\" AND p.oferta_id=".(int)$argv[1]." AND p.activo=1");
echo (int)$stmt->fetchColumn();
' "$Y")
if [ "$DUP" = "1" ]; then ok 'concurrencia no creó duplicados activos'; else fail "duplicados activos=$DUP"; fi

printf '\n== selección vs nueva postulación de la misma empresa ==\n'
S1=/tmp/opencode/concurrencia-seleccion.code
P1=/tmp/opencode/concurrencia-postulacion.code
curl -s -o /tmp/opencode/concurrencia-seleccion.json -w '%{http_code}' \
    -X PUT "$B/api/empresa/postulaciones/$PX/estado" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}' > "$S1" &
SEL_PID=$!
curl -s -o /tmp/opencode/concurrencia-postulacion.json -w '%{http_code}' \
    -X POST "$B2/api/postulante/postulaciones" -H "Authorization: Bearer $TP" \
    -H 'Content-Type: application/json' -d "{\"oferta_id\":$Z}" > "$P1" &
POST_PID=$!
wait "$SEL_PID" "$POST_PID"
SEL_CODE=$(cat "$S1"); POST_CODE=$(cat "$P1")
if [ "$SEL_CODE" = "200" ]; then ok "selección concurrente aplicada ($SEL_CODE)"; else fail "selección concurrente ($SEL_CODE)"; fi
if [ "$POST_CODE" = "201" ] || [ "$POST_CODE" = "409" ]; then ok "postulación concurrente devolvió $POST_CODE"; else fail "postulación concurrente devolvió $POST_CODE"; fi

# Si la postulación ganó el turno, debe existir una única postulación activa
# a Z y la selección debe quedar confirmada. Si ganó la selección, Z no debe
# haberse insertado. Ambos son órdenes seriales válidos; lo inválido sería un
# 201 creado después de que la selección ya estuviera confirmada.
if [ "$POST_CODE" = "201" ]; then
    POST_COUNT=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT COUNT(*) FROM postulaciones p JOIN postulantes po ON po.id=p.postulante_id WHERE po.dni=\"87654321\" AND p.oferta_id=".(int)$argv[1]." AND p.activo=1");
echo (int)$stmt->fetchColumn();
' "$Z")
    if [ "$POST_COUNT" = "1" ]; then ok 'postulación concurrente ganó el turno antes de la selección'; else fail "postulación concurrente inconsistente ($POST_COUNT)"; fi
    ZP_ID=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT p.id FROM postulaciones p JOIN postulantes po ON po.id=p.postulante_id WHERE po.dni=\"87654321\" AND p.oferta_id=".(int)$argv[1]." AND p.activo=1 LIMIT 1");
echo (int)$stmt->fetchColumn();
' "$Z")
    HIST_ID=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT MAX(id) FROM postulacion_historial WHERE postulacion_id=".(int)$argv[1]." AND estado_nuevo=\"seleccionado\"");
echo (int)$stmt->fetchColumn();
' "$PX")
    if [ -n "$ZP_ID" ] && [ -n "$HIST_ID" ] && [ "$ZP_ID" -lt "$HIST_ID" ]; then
        ok "orden de autoincrementos confirma postulación antes de selección ($ZP_ID < $HIST_ID)"
    else
        fail "postulación posterior a la selección (post=$ZP_ID, historial=$HIST_ID)"
    fi
elif [ "$POST_CODE" = "409" ]; then
    POST_COUNT=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT COUNT(*) FROM postulaciones p JOIN postulantes po ON po.id=p.postulante_id WHERE po.dni=\"87654321\" AND p.oferta_id=".(int)$argv[1]." AND p.activo=1");
echo (int)$stmt->fetchColumn();
' "$Z")
    if [ "$POST_COUNT" = "0" ]; then ok 'selección concurrente bloqueó la postulación a Z'; else fail "postulación a Z creada a pesar del 409 ($POST_COUNT)"; fi
fi

SEL_ESTADO=$(php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT estado FROM postulaciones WHERE id=".(int)$argv[1]);
echo (string)$stmt->fetchColumn();
' "$PX")
if [ "$SEL_ESTADO" = "seleccionado" ]; then ok 'estado seleccionado persistido tras la carrera'; else fail "estado de selección persistido=$SEL_ESTADO"; fi

# Otra empresa sigue permitiendo postular después de la selección.
CREATE_B=$(curl -s -o /tmp/opencode/concurrencia-empresa-b.json -w '%{http_code}' -X POST "$B/api/admin/empresas" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"ruc":"20606666666","razon_social":"Empresa Concurrencia B SAC","evaluacion_presencial":true,"password":"Otra12345!"}')
if [ "$CREATE_B" = "201" ]; then ok 'empresa B preparada'; else fail "crear empresa B ($CREATE_B)"; fi
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20606666666","password":"Otra12345!"}' | tok)
W=$(crear_oferta "$TE2" "Oferta empresa B concurrencia" "$FUTURO" | id_json)
CODE_W=$(aprobar_oferta "$TA" "$W")
if [ "$CODE_W" = "200" ]; then ok 'oferta B aprobada'; else fail "aprobar oferta B ($CODE_W)"; fi
P_W=$(curl -s -o /tmp/opencode/concurrencia-post-b.json -w '%{http_code}' -X POST "$B2/api/postulante/postulaciones" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$W}")
if [ "$P_W" = "201" ]; then ok 'postulación a empresa distinta permitida tras selección'; else fail "postulación a empresa distinta ($P_W)"; fi

printf '\nFIN concurrencia\n'
[ "$fallos" -eq 0 ] || exit 1
