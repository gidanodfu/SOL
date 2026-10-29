#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Unicidad global de correo/teléfono en el alta municipal, campos obligatorios,
# normalización telefónica, actualización de reservas y concurrencia.
#
# Se ejecuta dentro de un esquema MySQL aislado preparado por deploy/scripts/smoke.sh.
set -u

cd "$(dirname "$0")/../../backend" || exit 1

B1=http://127.0.0.1:8080
B2=http://127.0.0.1:8081
SUFIJO="$$_$(date +%s)"
LOG1=/tmp/opencode/spark_unicidad_1.log
LOG2=/tmp/opencode/spark_unicidad_2.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 --port 8080 > "$LOG1" 2>&1 &
SRV1=$!
env 'storage.driver=local' php spark serve --host 127.0.0.1 --port 8081 > "$LOG2" 2>&1 &
SRV2=$!
trap 'kill "$SRV1" "$SRV2" 2>/dev/null' EXIT

for _ in $(seq 1 40); do
    curl -s -o /dev/null "$B1/health" && curl -s -o /dev/null "$B2/health" && break
    sleep 0.5
done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

check_code() {
    local label="$1" esperado="$2" real="$3"
    if [ "$real" = "$esperado" ]; then
        ok "$label ($real)"
    else
        fail "$label ($real, esperado $esperado)"
    fi
}

json_field() {
    python3 - "$1" "$2" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as fh:
    valor = json.load(fh)
for parte in sys.argv[2].split('.'):
    valor = valor.get(parte) if isinstance(valor, dict) else None
print('' if valor is None else valor)
PY
}

assert_field() {
    local archivo="$1" campo="$2" etiqueta="$3"
    local valor
    valor=$(json_field "$archivo" "campos.$campo")
    if [ -n "$valor" ]; then
        ok "$etiqueta (campos.$campo)"
    else
        fail "$etiqueta (falta campos.$campo)"
    fi
}

body_usuario() {
    python3 - "$1" "$2" "$3" "$4" <<'PY'
import json
import sys

print(json.dumps({
    'username': sys.argv[1],
    'nombres': 'QA',
    'apellidos': 'Unicidad',
    'email': sys.argv[2],
    'telefono': sys.argv[3],
    'password': 'Clave123!',
    'perfil_municipal': sys.argv[4],
}, ensure_ascii=False))
PY
}

mutar_campo() {
    python3 - "$1" "$2" "$3" <<'PY'
import json
import sys

datos = json.loads(sys.argv[1])
datos[sys.argv[2]] = sys.argv[3]
print(json.dumps(datos, ensure_ascii=False))
PY
}

quitar_campo() {
    python3 - "$1" "$2" <<'PY'
import json
import sys

datos = json.loads(sys.argv[1])
datos.pop(sys.argv[2], None)
print(json.dumps(datos, ensure_ascii=False))
PY
}

post_to() {
    local base="$1" token="$2" body="$3" salida="$4"
    curl -s -o "$salida" -w '%{http_code}' -X POST "$base/api/admin/usuarios" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "$body"
}

put_to() {
    local base="$1" token="$2" id="$3" body="$4" salida="$5"
    curl -s -o "$salida" -w '%{http_code}' -X PUT "$base/api/admin/usuarios/$id" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "$body"
}

db_exec() {
    php -r '
$pdo = new PDO(
    "mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"),
    getenv("DB_USER"),
    getenv("DB_PASSWORD"),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$pdo->exec($argv[1]);
' "$1"
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

TOKEN=$(curl -s -X POST "$B1/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"Admin123!"}' \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["data"]["access_token"])')

printf '\n== 1. alta válida para los tres perfiles ==\n'
declare -A PERFIL_EMAIL PERFIL_TEL PERFIL_ID
PERFIL_TEL[admin]=957420001
PERFIL_TEL[moderador]=957420002
PERFIL_TEL[solo_lectura]=957420003
for perfil in admin moderador solo_lectura; do
    EMAIL="qa.uni.$perfil.$SUFIJO@example.test"
    USUARIO="qa_uni_${perfil}_$SUFIJO"
    RESP="/tmp/opencode/uni_crear_$perfil.json"
    BODY=$(body_usuario "$USUARIO" "$EMAIL" "${PERFIL_TEL[$perfil]}" "$perfil")
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "crear $perfil" 201 "$CODE"
    PERFIL_EMAIL[$perfil]="$EMAIL"
    PERFIL_ID[$perfil]=$(json_field "$RESP" data.id)
done

for perfil in admin moderador solo_lectura; do
    ID="${PERFIL_ID[$perfil]}"
    ROL=$(db_scalar "SELECT rol FROM users WHERE id=$ID")
    PERFIL=$(db_scalar "SELECT perfil_municipal FROM users WHERE id=$ID")
    [ "$ROL" = "admin" ] && ok "rol principal admin en $perfil" || fail "rol principal incorrecto en $perfil: $ROL"
    [ "$PERFIL" = "$perfil" ] && ok "perfil asignado $perfil" || fail "perfil incorrecto en $perfil: $PERFIL"
done

printf '\n== 2. duplicados de correo y teléfono entre perfiles ==\n'
for perfil in admin moderador solo_lectura; do
    RESP="/tmp/opencode/uni_dup_email_$perfil.json"
    BODY=$(body_usuario "qa_dup_email_${perfil}_$SUFIJO" "${PERFIL_EMAIL[admin]}" "957420010" "$perfil")
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "correo duplicado con perfil $perfil" 409 "$CODE"
    assert_field "$RESP" email "campo email en duplicado $perfil"

    RESP="/tmp/opencode/uni_dup_tel_$perfil.json"
    BODY=$(body_usuario "qa_dup_tel_${perfil}_$SUFIJO" "qa.dup.tel.${perfil}.$SUFIJO@example.test" "${PERFIL_TEL[admin]}" "$perfil")
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "teléfono duplicado con perfil $perfil" 409 "$CODE"
    assert_field "$RESP" telefono "campo telefono en duplicado $perfil"
done

printf '\n== 3. duplicados de empresa y postulante ==\n'
RESP=/tmp/opencode/uni_dup_empresa_email.json
BODY=$(body_usuario "qa_emp_email_$SUFIJO" "contacto@losjardines.pe" "957420011" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo de empresa" 409 "$CODE"
assert_field "$RESP" email "campo email de empresa"

RESP=/tmp/opencode/uni_dup_postulante_email.json
BODY=$(body_usuario "qa_pos_email_$SUFIJO" "ana.torres@mail.com" "957420012" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo de postulante" 409 "$CODE"
assert_field "$RESP" email "campo email de postulante"

RESP=/tmp/opencode/uni_dup_empresa_tel.json
BODY=$(body_usuario "qa_emp_tel_$SUFIJO" "qa.emp.tel.$SUFIJO@example.test" "074612345" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "teléfono de empresa" 409 "$CODE"
assert_field "$RESP" telefono "campo telefono de empresa"

RESP=/tmp/opencode/uni_dup_postulante_tel.json
BODY=$(body_usuario "qa_pos_tel_$SUFIJO" "qa.pos.tel.$SUFIJO@example.test" "987654321" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "teléfono de postulante" 409 "$CODE"
assert_field "$RESP" telefono "campo telefono de postulante"

printf '\n== 4. normalización de correo y teléfono ==\n'
RESP=/tmp/opencode/uni_case_email.json
BODY=$(body_usuario "qa_case_email_$SUFIJO" "  QA.UNI.ADMIN.$SUFIJO@EXAMPLE.TEST  " "957420013" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo con mayúsculas y espacios" 409 "$CODE"
assert_field "$RESP" email "campo email con mayúsculas/espacios"

for VARIANTE in "+51 957 420 001" "51957420001" "0051 957 420 001" "00957420001" "957-420-001" "(957) 420-001"; do
    RESP="/tmp/opencode/uni_tel_$(printf '%s' "$VARIANTE" | tr -cd '0-9').json"
    BODY=$(body_usuario "qa_tel_$(printf '%s' "$VARIANTE" | tr -cd '0-9')_$SUFIJO" "qa.variante.$(printf '%s' "$VARIANTE" | tr -cd '0-9').$SUFIJO@example.test" "$VARIANTE" admin)
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "teléfono equivalente: $VARIANTE" 409 "$CODE"
    assert_field "$RESP" telefono "campo telefono: $VARIANTE"
done

printf '\n== 5. formatos inválidos y campos obligatorios ==\n'
ANTES_USERS=$(db_scalar 'SELECT COUNT(*) FROM users')

RESP=/tmp/opencode/uni_bad_email.json
BODY=$(body_usuario "qa_bad_email_$SUFIJO" "no-es-correo" "957420020" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo inválido" 422 "$CODE"
assert_field "$RESP" email "campo email inválido"

RESP=/tmp/opencode/uni_bad_tel.json
BODY=$(body_usuario "qa_bad_tel_$SUFIJO" "qa.bad.tel.$SUFIJO@example.test" "12345" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "teléfono inválido" 422 "$CODE"
assert_field "$RESP" telefono "campo telefono inválido"

RESP=/tmp/opencode/uni_bad_tel_00.json
BODY=$(body_usuario "qa_bad_tel_00_$SUFIJO" "qa.bad.tel.00.$SUFIJO@example.test" "0033123456789" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "00 internacional no convertido a nacional" 422 "$CODE"
assert_field "$RESP" telefono "campo telefono 00 internacional"

RESP=/tmp/opencode/uni_empty_email.json
BODY=$(body_usuario "qa_empty_email_$SUFIJO" "" "957420021" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo vacío" 422 "$CODE"
assert_field "$RESP" email "campo email vacío"

RESP=/tmp/opencode/uni_missing_email.json
BASE=$(body_usuario "qa_missing_email_$SUFIJO" "qa.missing.email.$SUFIJO@example.test" "957420022" admin)
BODY=$(quitar_campo "$BASE" email)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "correo ausente" 422 "$CODE"
assert_field "$RESP" email "campo email ausente"

for CAMPO in username nombres apellidos password; do
    RESP="/tmp/opencode/uni_empty_$CAMPO.json"
    BASE=$(body_usuario "qa_empty_${CAMPO}_$SUFIJO" "qa.empty.${CAMPO}.$SUFIJO@example.test" "957420023" admin)
    BODY=$(mutar_campo "$BASE" "$CAMPO" "")
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "$CAMPO vacío" 422 "$CODE"
    assert_field "$RESP" "$CAMPO" "campo $CAMPO vacío"
done

RESP=/tmp/opencode/uni_empty_phone.json
BODY=$(body_usuario "qa_empty_phone_$SUFIJO" "qa.empty.phone.$SUFIJO@example.test" "" solo_lectura)
CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
check_code "teléfono vacío opcional" 201 "$CODE"
ID_EMPTY_PHONE=$(json_field "$RESP" data.id)
[ "$(db_scalar "SELECT COUNT(*) FROM users WHERE id=$ID_EMPTY_PHONE AND telefono IS NULL")" = "1" ] \
    && ok 'teléfono vacío almacenado como NULL' \
    || fail 'teléfono vacío no quedó NULL'

DESPUES_USERS=$(db_scalar 'SELECT COUNT(*) FROM users')
# Solo el alta con teléfono vacío debe haber incrementado el total.
if [ "$DESPUES_USERS" -eq "$((ANTES_USERS + 1))" ]; then
    ok 'rechazos sin filas parciales'
else
    fail "rechazos crearon filas: $ANTES_USERS -> $DESPUES_USERS"
fi

printf '\n== 6. actualización de identidades y reservas ==\n'
ID_ADMIN="${PERFIL_ID[admin]}"
OLD_EMAIL="${PERFIL_EMAIL[admin]}"
OLD_TEL="${PERFIL_TEL[admin]}"
NEW_EMAIL="qa.uni.updated.$SUFIJO@example.test"
NEW_TEL=957420030

BODY=$(python3 - "$NEW_EMAIL" "$NEW_TEL" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Unicidad actualizada', 'email': sys.argv[1], 'telefono': sys.argv[2]}))
PY
)
CODE=$(put_to "$B1" "$TOKEN" "$ID_ADMIN" "$BODY" /tmp/opencode/uni_update.json)
check_code "actualizar correo y teléfono" 200 "$CODE"
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$NEW_EMAIL' AND user_id=$ID_ADMIN")" = "1" ] \
    && ok 'reserva nueva de correo persiste' \
    || fail 'reserva nueva de correo ausente'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='telefono' AND valor='$NEW_TEL' AND user_id=$ID_ADMIN")" = "1" ] \
    && ok 'reserva nueva de teléfono persiste' \
    || fail 'reserva nueva de teléfono ausente'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$OLD_EMAIL' AND user_id=$ID_ADMIN")" = "0" ] \
    && ok 'reserva anterior de correo liberada' \
    || fail 'reserva anterior de correo aún existe'

BODY=$(python3 - "${PERFIL_EMAIL[moderador]}" "$NEW_TEL" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Intento duplicado', 'email': sys.argv[1], 'telefono': sys.argv[2]}))
PY
)
RESP=/tmp/opencode/uni_update_dup.json
CODE=$(put_to "$B1" "$TOKEN" "$ID_ADMIN" "$BODY" "$RESP")
check_code "actualizar a correo ajeno" 409 "$CODE"
assert_field "$RESP" email "campo email en actualización duplicada"
[ "$(db_scalar "SELECT email FROM users WHERE id=$ID_ADMIN")" = "$NEW_EMAIL" ] \
    && ok 'la identidad anterior se conserva tras el rechazo' \
    || fail 'la identidad anterior cambió tras el rechazo'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$NEW_EMAIL' AND user_id=$ID_ADMIN")" = "1" ] \
    && ok 'reserva nueva se conserva tras rechazo' \
    || fail 'reserva nueva perdida tras rechazo'

BODY=$(python3 - "$NEW_EMAIL" "$NEW_TEL" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Sin cambios', 'email': sys.argv[1], 'telefono': sys.argv[2]}))
PY
)
CODE=$(put_to "$B1" "$TOKEN" "$ID_ADMIN" "$BODY" /tmp/opencode/uni_update_same.json)
check_code "actualizar sin cambiar identidad" 200 "$CODE"
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$NEW_EMAIL' AND user_id=$ID_ADMIN")" = "1" ] \
    && ok 'reserva se mantiene sin cambios' \
    || fail 'reserva se perdió sin cambios'

BODY=$(python3 - "$NEW_EMAIL" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Sin teléfono', 'email': sys.argv[1], 'telefono': ''}))
PY
)
CODE=$(put_to "$B1" "$TOKEN" "$ID_ADMIN" "$BODY" /tmp/opencode/uni_update_clear_tel.json)
check_code "eliminar teléfono opcional" 200 "$CODE"
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='telefono' AND user_id=$ID_ADMIN")" = "0" ] \
    && ok 'reserva de teléfono liberada' \
    || fail 'reserva de teléfono no liberada'

printf '\n== 7. teléfonos históricos con formatos 00 y 0051 ==\n'
RAW_USER_00="qa_raw00_$SUFIJO"
RAW_USER_0051="qa_raw0051_$SUFIJO"
db_exec "INSERT INTO users (username,password_hash,rol,nombres,apellidos,email,telefono,estado,created_at,updated_at) VALUES ('$RAW_USER_00','x','postulante','QA','Raw 00','raw00.$SUFIJO@example.test','00957420040','activo',NOW(),NOW())"
db_exec "INSERT INTO users (username,password_hash,rol,nombres,apellidos,email,telefono,estado,created_at,updated_at) VALUES ('$RAW_USER_0051','x','postulante','QA','Raw 0051','raw0051.$SUFIJO@example.test','0051957420041','activo',NOW(),NOW())"

for CASO in "00:957420040" "0051:957420041"; do
    PREFIJO=${CASO%%:*}
    CANONICO=${CASO#*:}
    RESP="/tmp/opencode/uni_raw_$PREFIJO.json"
    BODY=$(body_usuario "qa_raw_check_${PREFIJO}_$SUFIJO" "qa.raw.check.${PREFIJO}.$SUFIJO@example.test" "$CANONICO" admin)
    CODE=$(post_to "$B1" "$TOKEN" "$BODY" "$RESP")
    check_code "teléfono histórico $PREFIJO comparado como $CANONICO" 409 "$CODE"
    assert_field "$RESP" telefono "campo telefono histórico $PREFIJO"
done

printf '\n== 8. concurrencia de altas ==\n'
conc_pair() {
    local etiqueta="$1" body1="$2" body2="$3" out1="$4" out2="$5"
    post_to "$B1" "$TOKEN" "$body1" "$out1" > /tmp/opencode/uni_conc_code1 &
    local pid1=$!
    post_to "$B2" "$TOKEN" "$body2" "$out2" > /tmp/opencode/uni_conc_code2 &
    local pid2=$!
    wait "$pid1" "$pid2"
    local c1 c2
    c1=$(cat /tmp/opencode/uni_conc_code1)
    c2=$(cat /tmp/opencode/uni_conc_code2)
    if { [ "$c1" = "201" ] && [ "$c2" = "409" ]; } || { [ "$c1" = "409" ] && [ "$c2" = "201" ]; }; then
        ok "$etiqueta: un 201 y un 409 ($c1/$c2)"
    else
        fail "$etiqueta: códigos $c1/$c2"
    fi
}

CONC_EMAIL="qa.conc.$SUFIJO@example.test"
CONC_TEL=957420050
BODY_A=$(body_usuario "qa_conc_a_$SUFIJO" "$CONC_EMAIL" "$CONC_TEL" admin)
BODY_B=$(body_usuario "qa_conc_b_$SUFIJO" "$CONC_EMAIL" "$CONC_TEL" moderador)
conc_pair 'mismo correo y teléfono' "$BODY_A" "$BODY_B" /tmp/opencode/uni_conc_a.json /tmp/opencode/uni_conc_b.json
[ "$(db_scalar "SELECT COUNT(*) FROM users WHERE LOWER(TRIM(email))='$CONC_EMAIL'")" = "1" ] && ok 'una sola cuenta con el correo concurrente' || fail 'correo concurrente duplicado'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$CONC_EMAIL'")" = "1" ] && ok 'una sola reserva de correo concurrente' || fail 'reserva de correo concurrente incorrecta'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='telefono' AND valor='$CONC_TEL'")" = "1" ] && ok 'una sola reserva de teléfono concurrente' || fail 'reserva de teléfono concurrente incorrecta'

CONC_TEL_2=957420051
BODY_A=$(body_usuario "qa_conc_tel_a_$SUFIJO" "qa.conc.tel.a.$SUFIJO@example.test" "$CONC_TEL_2" admin)
BODY_B=$(body_usuario "qa_conc_tel_b_$SUFIJO" "qa.conc.tel.b.$SUFIJO@example.test" "$CONC_TEL_2" solo_lectura)
conc_pair 'mismo teléfono con correos distintos' "$BODY_A" "$BODY_B" /tmp/opencode/uni_conc_tel_a.json /tmp/opencode/uni_conc_tel_b.json
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='telefono' AND valor='$CONC_TEL_2'")" = "1" ] && ok 'una sola reserva de teléfono en carrera' || fail 'reserva de teléfono en carrera incorrecta'

CONC_EMAIL_3="qa.conc.email.$SUFIJO@example.test"
BODY_A=$(body_usuario "qa_conc_email_a_$SUFIJO" "$CONC_EMAIL_3" "957420052" admin)
BODY_B=$(body_usuario "qa_conc_email_b_$SUFIJO" "$CONC_EMAIL_3" "957420053" moderador)
conc_pair 'mismo correo con teléfonos distintos' "$BODY_A" "$BODY_B" /tmp/opencode/uni_conc_email_a.json /tmp/opencode/uni_conc_email_b.json
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$CONC_EMAIL_3'")" = "1" ] && ok 'una sola reserva de correo en carrera' || fail 'reserva de correo en carrera incorrecta'

printf '\n== 9. concurrencia de actualización de identidades ==\n'
BODY_UPD_A=$(body_usuario "qa_upd_conc_a_$SUFIJO" "qa.upd.conc.a.$SUFIJO@example.test" "957420060" admin)
BODY_UPD_B=$(body_usuario "qa_upd_conc_b_$SUFIJO" "qa.upd.conc.b.$SUFIJO@example.test" "957420061" admin)
CODE=$(post_to "$B1" "$TOKEN" "$BODY_UPD_A" /tmp/opencode/uni_upd_conc_a.json)
check_code 'crear cuenta A para carrera de actualización' 201 "$CODE"
ID_UPD_A=$(json_field /tmp/opencode/uni_upd_conc_a.json data.id)
CODE=$(post_to "$B1" "$TOKEN" "$BODY_UPD_B" /tmp/opencode/uni_upd_conc_b.json)
check_code 'crear cuenta B para carrera de actualización' 201 "$CODE"
ID_UPD_B=$(json_field /tmp/opencode/uni_upd_conc_b.json data.id)
UPD_EMAIL="qa.conc.update.$SUFIJO@example.test"
BODY_A=$(python3 - "$UPD_EMAIL" "957420060" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Concurrente A', 'email': sys.argv[1], 'telefono': sys.argv[2]}))
PY
)
BODY_B=$(python3 - "$UPD_EMAIL" "957420061" <<'PY'
import json
import sys
print(json.dumps({'nombres': 'QA', 'apellidos': 'Concurrente B', 'email': sys.argv[1], 'telefono': sys.argv[2]}))
PY
)
put_to "$B1" "$TOKEN" "$ID_UPD_A" "$BODY_A" /tmp/opencode/uni_upd_conc_resp_a.json > /tmp/opencode/uni_upd_conc_code_a &
PA=$!
put_to "$B2" "$TOKEN" "$ID_UPD_B" "$BODY_B" /tmp/opencode/uni_upd_conc_resp_b.json > /tmp/opencode/uni_upd_conc_code_b &
PB=$!
wait "$PA" "$PB"
CA=$(cat /tmp/opencode/uni_upd_conc_code_a)
CB=$(cat /tmp/opencode/uni_upd_conc_code_b)
if { [ "$CA" = "200" ] && [ "$CB" = "409" ]; } || { [ "$CA" = "409" ] && [ "$CB" = "200" ]; }; then
    ok "actualización concurrente: un 200 y un 409 ($CA/$CB)"
else
    fail "actualización concurrente: códigos $CA/$CB"
fi
[ "$(db_scalar "SELECT COUNT(*) FROM users WHERE LOWER(TRIM(email))='$UPD_EMAIL'")" = "1" ] && ok 'una sola identidad con el correo actualizado' || fail 'correo actualizado duplicado'
[ "$(db_scalar "SELECT COUNT(*) FROM identidades_reservadas WHERE tipo='email' AND valor='$UPD_EMAIL'")" = "1" ] && ok 'una sola reserva tras actualización concurrente' || fail 'reserva de actualización concurrente incorrecta'

printf '\nFIN unicidad municipal\n'
[ "$fallos" -eq 0 ] || exit 1
