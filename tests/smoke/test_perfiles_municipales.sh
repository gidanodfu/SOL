#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Perfiles municipales: persistencia, migración, autorización real y auditoría.
# Se ejecuta dentro del contenedor de pruebas con un esquema MySQL aislado.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_perfiles.log
fallos=0
SUFIJO="$$_$(date +%s)"

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }
paso() { printf '\n== %s ==\n' "$1"; }

check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then ok "$nombre ($real)"; else fail "$nombre ($real, esperado $esperado)"; fi
}

tok() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "login sin access_token";print(d["data"]["access_token"])'
}

me() {
    curl -s "$B/api/auth/me" -H "Authorization: Bearer $1"
}

crear_usuario() {
    # $1 token, $2 username, $3 perfil, $4 password
    BODY=$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"nombres":"QA","apellidos":sys.argv[2],"email":sys.argv[1]+"@example.test","telefono":"","password":sys.argv[3],"perfil_municipal":sys.argv[4]}))' "$2" "$SUFIJO" "$4" "$3")
    curl -s -o /tmp/opencode/perfil_crear_$2.json -w '%{http_code}' -X POST "$B/api/admin/usuarios" \
        -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$BODY"
}

perfil_me() {
    me "$1" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;u=d["data"];print(u.get("perfil_municipal") or "");print(",".join(u.get("permisos_municipales") or []))'
}

TA_ADM=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TA_EMP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA_POS=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
ADMIN_ID=$(me "$TA_ADM" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')

paso "1. migración y perfiles existentes"
COLUMNA=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$c = $pdo->query("SHOW COLUMNS FROM users LIKE \"perfil_municipal\"")->fetch(PDO::FETCH_ASSOC);
$r = $pdo->query("SELECT SUM(rol = \"admin\" AND perfil_municipal IS NULL) AS admin_sin_perfil, SUM(rol <> \"admin\" AND perfil_municipal IS NOT NULL) AS otros_con_perfil FROM users")->fetch(PDO::FETCH_ASSOC);
echo json_encode(["tipo" => $c["Type"] ?? "missing", "admin_sin_perfil" => (int) $r["admin_sin_perfil"], "otros_con_perfil" => (int) $r["otros_con_perfil"]]);
')
echo "$COLUMNA"
echo "$COLUMNA" | grep -q 'enum(.admin.,.moderador.,.solo_lectura.)' && ok 'columna ENUM con tres perfiles' || fail 'columna perfil_municipal incorrecta'
echo "$COLUMNA" | grep -q '"admin_sin_perfil":0' && ok 'ningún admin existente quedó sin perfil' || fail 'quedaron admins sin perfil'
echo "$COLUMNA" | grep -q '"otros_con_perfil":0' && ok 'empresa/postulante no recibieron perfil municipal' || fail 'empresa/postulante contaminados'

paso "2. sesión y permisos de los perfiles semilla"
ADMIN_ME=$(perfil_me "$TA_ADM")
echo "$ADMIN_ME" | head -1 | grep -qx 'admin' && ok 'admin conserva perfil admin' || fail 'admin sin perfil admin'
echo "$ADMIN_ME" | tail -1 | grep -q 'usuarios' && ok 'admin recibe permiso usuarios' || fail 'admin sin permiso usuarios'
echo "$ADMIN_ME" | tail -1 | grep -q 'reportes_csv' && ok 'admin recibe permiso CSV' || fail 'admin sin permiso CSV'

MOD_ME=$(perfil_me "$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"moderador","password":"Moderador123!"}' | tok)")
echo "$MOD_ME" | head -1 | grep -qx 'moderador' && ok 'moderador semilla con perfil correcto' || fail 'moderador semilla incorrecto'
echo "$MOD_ME" | tail -1 | grep -q 'ofertas' && ok 'moderador recibe permiso ofertas' || fail 'moderador sin permiso ofertas'
echo "$MOD_ME" | tail -1 | grep -q 'usuarios' && fail 'moderador recibió permiso usuarios' || ok 'moderador sin permiso usuarios'
echo "$MOD_ME" | tail -1 | grep -q 'reportes_csv' && fail 'moderador recibió permiso CSV' || ok 'moderador sin permiso CSV'

LEC_ME=$(perfil_me "$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"lectura","password":"Lectura123!"}' | tok)")
echo "$LEC_ME" | head -1 | grep -qx 'solo_lectura' && ok 'solo lectura semilla con perfil correcto' || fail 'solo lectura semilla incorrecto'
[ "$(echo "$LEC_ME" | tail -1)" = "municipal.lectura" ] && ok 'solo lectura únicamente puede consultar' || fail 'solo lectura recibió permisos adicionales'

paso "3. creación mediante el endpoint municipal"
check_code 'crear sin perfil => 422' 422 "$(BODY=$(python3 -c 'import json,sys; print(json.dumps({"username":"sinperfil_"+sys.argv[1],"nombres":"QA","apellidos":"Sin perfil","password":"Perfil123!","email":""}))' "$SUFIJO"); curl -s -o /tmp/opencode/perfil_sin.json -w '%{http_code}' -X POST "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'perfil inválido => 422' 422 "$(BODY=$(python3 -c 'import json,sys; print(json.dumps({"username":"invalido_"+sys.argv[1],"nombres":"QA","apellidos":"Inválido","password":"Perfil123!","email":"","perfil_municipal":"superadmin"}))' "$SUFIJO"); curl -s -o /tmp/opencode/perfil_invalido.json -w '%{http_code}' -X POST "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"

U_ADMIN="qa_admin_$SUFIJO"
U_MOD="qa_mod_$SUFIJO"
U_LEC="qa_lector_$SUFIJO"
TA_ADMIN2=""
TA_MOD=""
TA_LEC=""

check_code 'crear ADMIN => 201' 201 "$(crear_usuario "$TA_ADM" "$U_ADMIN" admin 'Perfil123!')"
ID_ADMIN2=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/perfil_crear_'"$U_ADMIN"'.json"))["data"]["id"])')
check_code 'crear MODERADOR => 201' 201 "$(crear_usuario "$TA_ADM" "$U_MOD" moderador 'Perfil123!')"
ID_MOD=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/perfil_crear_'"$U_MOD"'.json"))["data"]["id"])')
check_code 'crear SOLO LECTURA => 201' 201 "$(crear_usuario "$TA_ADM" "$U_LEC" solo_lectura 'Perfil123!')"
ID_LEC=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/perfil_crear_'"$U_LEC"'.json"))["data"]["id"])')

TA_ADMIN2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$U_ADMIN\",\"password\":\"Perfil123!\"}" | tok)
TA_MOD=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$U_MOD\",\"password\":\"Perfil123!\"}" | tok)
TA_LEC=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$U_LEC\",\"password\":\"Perfil123!\"}" | tok)

check_code 'ADMIN creado puede listar usuarios' 200 "$(curl -s -o /tmp/opencode/perfil_users_admin2.json -w '%{http_code}' "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_ADMIN2")"
grep -q "$U_MOD" /tmp/opencode/perfil_users_admin2.json && ok 'tabla incluye el nuevo usuario' || fail 'tabla no incluye el nuevo usuario'
grep -q '"perfil_municipal":"moderador"' /tmp/opencode/perfil_users_admin2.json && ok 'tabla expone el perfil municipal' || fail 'tabla no expone perfil'
check_code 'ADMIN exporta CSV' 200 "$(curl -s -o /tmp/opencode/perfil_admin.csv -w '%{http_code}' "$B/api/admin/reportes/csv" -H "Authorization: Bearer $TA_ADM")"

paso "4. cambio de perfil y último administrador"
check_code 'cambio con perfil inválido => 422' 422 "$(BODY='{"perfil_municipal":"superadmin"}'; curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ID_MOD/perfil" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'admin puede degradar a otro admin' 200 "$(BODY='{"perfil_municipal":"solo_lectura"}'; curl -s -o /tmp/opencode/perfil_admin2_solo.json -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ID_ADMIN2/perfil" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'token anterior del admin degradado pierde usuarios' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_ADMIN2")"
check_code 'último admin no puede autodegradarse => 409' 409 "$(BODY="{\"perfil_municipal\":\"solo_lectura\"}"; curl -s -o /tmp/opencode/perfil_ultimo.json -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ADMIN_ID/perfil" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'admin no puede autodesactivarse => 403' 403 "$(BODY='{"estado":"inactivo"}'; curl -s -o /tmp/opencode/perfil_autooff.json -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ADMIN_ID/estado" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"

paso "5. MODERADOR: consulta, operación y límites"
for ruta in dashboard empresas solicitudes-empresa ofertas actividades oportunidades contrataciones reportes; do
    check_code "moderador consulta $ruta" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/$ruta" -H "Authorization: Bearer $TA_MOD")"
done
check_code 'moderador exporta Excel' 200 "$(curl -s -o /tmp/opencode/perfil_mod.xlsx -w '%{http_code}' "$B/api/admin/reportes/excel" -H "Authorization: Bearer $TA_MOD")"
check_code 'moderador exporta PDF' 200 "$(curl -s -o /tmp/opencode/perfil_mod.pdf -w '%{http_code}' "$B/api/admin/reportes/pdf" -H "Authorization: Bearer $TA_MOD")"
check_code 'moderador no exporta CSV' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/csv" -H "Authorization: Bearer $TA_MOD")"
[ "$(head -c 2 /tmp/opencode/perfil_mod.xlsx)" = "PK" ] && ok 'XLSX del moderador válido' || fail 'XLSX del moderador inválido'
[ "$(head -c 5 /tmp/opencode/perfil_mod.pdf)" = "%PDF-" ] && ok 'PDF del moderador válido' || fail 'PDF del moderador inválido'

OFERTA_ID=$(curl -s "$B/api/admin/ofertas" -H "Authorization: Bearer $TA_MOD" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(next((o["id"] for o in d.get("data",[]) if o.get("estado")=="publicada"), ""))')
if [ -n "$OFERTA_ID" ]; then
    check_code 'moderador ejecuta cierre operativo de oferta' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/$OFERTA_ID/cerrar" -H "Authorization: Bearer $TA_MOD")"
else
    fail 'no hay oferta publicada para probar la operación del moderador'
fi
check_code 'moderador pasa filtro de ofertas (404 de recurso)' 404 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/999999/aprobar" -H "Authorization: Bearer $TA_MOD")"
check_code 'moderador pasa filtro de actividades (422 de validación)' 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA_MOD" -H 'Content-Type: application/json' -d '{}')"
check_code 'moderador pasa filtro de oportunidades (422 de validación)' 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA_MOD" -H 'Content-Type: application/json' -d '{}')"
check_code 'moderador pasa filtro de solicitudes (404 de recurso)' 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/solicitudes-empresa/999999/reenviar" -H "Authorization: Bearer $TA_MOD")"
check_code 'moderador pasa filtro de enlace (404 de recurso)' 404 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/solicitudes-empresa/999999/enlace" -H "Authorization: Bearer $TA_MOD")"

for ruta in "GET usuarios" "POST usuarios" "PUT usuarios/$ID_MOD" "PUT usuarios/$ADMIN_ID/perfil" "POST empresas" "PUT empresas/1/estado" "PUT empresas/1/password"; do
    metodo=${ruta%% *}; recurso=${ruta#* }
    args=(-s -o /dev/null -w '%{http_code}' -X "$metodo" "$B/api/admin/$recurso" -H "Authorization: Bearer $TA_MOD" -H 'Content-Type: application/json' -d '{}')
    check_code "moderador denegado: $ruta" 403 "$(curl "${args[@]}")"
done

paso "6. cambio de perfil aplica a tokens existentes"
BODY='{"perfil_municipal":"solo_lectura"}'
check_code 'degradar moderador a solo lectura' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ID_MOD/perfil" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'token previo del moderador pierde escritura' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA_MOD" -H 'Content-Type: application/json' -d '{}')"
check_code 'token previo conserva lectura' 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/dashboard" -H "Authorization: Bearer $TA_MOD")"
check_code 'token previo pierde exportación' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/excel" -H "Authorization: Bearer $TA_MOD")"
BODY='{"perfil_municipal":"moderador"}'
check_code 'restaurar perfil moderador' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ID_MOD/perfil" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
check_code 'token previo recupera escritura al restaurar' 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA_MOD" -H 'Content-Type: application/json' -d '{}')"
BODY=$(python3 -c 'import json,sys; print(json.dumps({"nombres":"QA","apellidos":"Lectura","email":sys.argv[1]+"@example.test","telefono":"","perfil_municipal":"admin"}))' "$U_LEC")
check_code 'actualizar datos ignora perfil enviado en el cuerpo' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$ID_LEC" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d "$BODY")"
PERFIL_LEC=$(curl -s "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_ADM" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"]["data"];print(next((u["perfil_municipal"] for u in d if u["id"]==int(sys.argv[1])), "missing"))' "$ID_LEC")
[ "$PERFIL_LEC" = "solo_lectura" ] && ok 'el campo perfil no se puede elevar desde el update general' || fail "perfil alterado desde update general: $PERFIL_LEC"

paso "7. SOLO LECTURA: consulta y bloqueo de escritura"
SNAPSHOT_ANTES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$out = [];
foreach (["users", "empresas", "ofertas", "actividades", "oportunidades", "solicitudes_empresa", "postulaciones", "contrataciones"] as $tabla) {
    $out[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
}
$out["empresa_estado"] = $pdo->query("SELECT estado FROM empresas ORDER BY id LIMIT 1")->fetchColumn();
echo json_encode($out);
')
for ruta in dashboard empresas solicitudes-empresa ofertas actividades oportunidades contrataciones reportes; do
    check_code "lectura consulta $ruta" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/$ruta" -H "Authorization: Bearer $TA_LEC")"
done
for ruta in "GET usuarios" "POST usuarios" "PUT usuarios/$ID_LEC" "PUT usuarios/$ID_LEC/perfil" "PUT usuarios/$ID_LEC/estado" "PUT usuarios/$ID_LEC/password" "PUT ofertas/999999/aprobar" "POST actividades" "POST oportunidades" "POST solicitudes-empresa/999999/reenviar" "GET solicitudes-empresa/999999/enlace" "PUT empresas/1/estado" "POST empresas"; do
    metodo=${ruta%% *}; recurso=${ruta#* }
    check_code "lectura denegada: $ruta" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X "$metodo" "$B/api/admin/$recurso" -H "Authorization: Bearer $TA_LEC" -H 'Content-Type: application/json' -d '{}')"
done
for formato in csv excel pdf; do
    check_code "lectura denegada: reportes/$formato" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/$formato" -H "Authorization: Bearer $TA_LEC")"
done
SNAPSHOT_DESPUES=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$out = [];
foreach (["users", "empresas", "ofertas", "actividades", "oportunidades", "solicitudes_empresa", "postulaciones", "contrataciones"] as $tabla) {
    $out[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
}
$out["empresa_estado"] = $pdo->query("SELECT estado FROM empresas ORDER BY id LIMIT 1")->fetchColumn();
echo json_encode($out);
')
[ "$SNAPSHOT_ANTES" = "$SNAPSHOT_DESPUES" ] && ok 'las operaciones denegadas no modificaron datos' || fail "las operaciones denegadas alteraron datos: $SNAPSHOT_ANTES -> $SNAPSHOT_DESPUES"

paso "8. aislamiento de identidades y no regresión"
check_code 'empresa no accede a dashboard admin' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/dashboard" -H "Authorization: Bearer $TA_EMP")"
check_code 'postulante no accede a dashboard admin' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/dashboard" -H "Authorization: Bearer $TA_POS")"
check_code 'empresa no crea usuarios municipales' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_EMP" -H 'Content-Type: application/json' -d '{}')"
check_code 'postulante no crea usuarios municipales' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/usuarios" -H "Authorization: Bearer $TA_POS" -H 'Content-Type: application/json' -d '{}')"
check_code 'admin no actúa como empresa' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d '{}')"
check_code 'admin no actúa como postulante' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' -d '{}')"
EMP_ME=$(me "$TA_EMP")
POS_ME=$(me "$TA_POS")
echo "$EMP_ME" | grep -q '"perfil_municipal":null' && ok 'empresa sin perfil municipal' || fail 'empresa recibió perfil municipal'
echo "$POS_ME" | grep -q '"perfil_municipal":null' && ok 'postulante sin perfil municipal' || fail 'postulante recibió perfil municipal'
echo "$EMP_ME" | grep -q '"permisos_municipales":\[\]' && ok 'empresa sin permisos municipales' || fail 'empresa recibió permisos municipales'
echo "$POS_ME" | grep -q '"permisos_municipales":\[\]' && ok 'postulante sin permisos municipales' || fail 'postulante recibió permisos municipales'

paso "9. auditoría de creación y cambio de perfil"
AUDIT=$(php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->query("SELECT accion, detalle FROM auditoria WHERE accion IN (\"crear_usuario\", \"cambiar_perfil_municipal\") ORDER BY id");
$filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($filas);
')
echo "$AUDIT" | grep -q '"crear_usuario"' && ok 'auditoría registra creación de usuario' || fail 'falta auditoría de creación'
echo "$AUDIT" | grep -q '"cambiar_perfil_municipal"' && ok 'auditoría registra cambio de perfil' || fail 'falta auditoría de cambio'
echo "$AUDIT" | grep -q 'anterior' && ok 'auditoría conserva perfil anterior' || fail 'auditoría no conserva perfil anterior'
echo "$AUDIT" | grep -q 'Perfil123!' && fail 'la auditoría expuso una contraseña' || ok 'auditoría sin contraseñas'

printf '\nFIN perfiles municipales\n'
[ "$fallos" -eq 0 ] || exit 1

paso "10. reversión segura y backfill de la migración"
ANTES_USERS=$(php -r '$pdo=new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"),getenv("DB_USER"),getenv("DB_PASSWORD"));echo $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();')
php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$pdo->exec("UPDATE migrations SET batch = 999 WHERE class LIKE \"%AgregarPerfilMunicipal\"");
$pdo->exec("UPDATE users SET perfil_municipal = NULL WHERE rol = \"admin\"");
' || fail 'preparar rollback aislado'
php spark migrate:rollback -b 1 > /tmp/opencode/perfil_rollback.log 2>&1 || fail 'rollback de la migración falló'
COLUMNA_ROLLBACK=$(php -r '$pdo=new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"),getenv("DB_USER"),getenv("DB_PASSWORD"));echo $pdo->query("SHOW COLUMNS FROM users LIKE \"perfil_municipal\"")->fetch() ? "presente" : "ausente";')
[ "$COLUMNA_ROLLBACK" = "ausente" ] && ok 'down elimina únicamente perfil_municipal' || fail 'down no eliminó la columna'
DESPUES_USERS=$(php -r '$pdo=new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"),getenv("DB_USER"),getenv("DB_PASSWORD"));echo $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();')
[ "$ANTES_USERS" = "$DESPUES_USERS" ] && ok 'rollback conserva las cuentas existentes' || fail "rollback alteró cuentas: $ANTES_USERS -> $DESPUES_USERS"
php spark migrate > /tmp/opencode/perfil_remigrate.log 2>&1 || fail 'reaplicación de la migración falló'
COLUMNA_REAPLICADA=$(php -r '$pdo=new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"),getenv("DB_USER"),getenv("DB_PASSWORD"));echo $pdo->query("SHOW COLUMNS FROM users LIKE \"perfil_municipal\"")->fetch() ? "presente" : "ausente";')
[ "$COLUMNA_REAPLICADA" = "presente" ] && ok 'up vuelve a crear la columna' || fail 'up no reaplicó la columna'
BACKFILL=$(php -r '$pdo=new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"),getenv("DB_USER"),getenv("DB_PASSWORD"));echo $pdo->query("SELECT SUM(rol=\"admin\" AND perfil_municipal IS NULL) FROM users")->fetchColumn();')
[ "$BACKFILL" = "0" ] && ok 'backfill asigna perfil a los administradores existentes' || fail "quedaron administradores sin perfil: $BACKFILL"
