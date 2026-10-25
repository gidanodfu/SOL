#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Reglas de vigencia de ofertas y bloqueo por selección formal de empresa.
# Se ejecuta dentro del contenedor de pruebas con un esquema MySQL aislado.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark.log
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

crear_oferta() {
    token="$1"; puesto="$2"; cierre="$3"
    curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "{\"puesto\":\"$puesto\",\"vacantes\":1,\"descripcion\":\"Descripción de prueba\",\"funciones\":\"Funciones de prueba\",\"fecha_cierre\":\"$cierre\"}"
}

aprobar_oferta() {
    token="$1"; id="$2"
    curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/$id/aprobar" \
        -H "Authorization: Bearer $token"
}

postular() {
    token="$1"; id="$2"
    curl -s -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' -d "{\"oferta_id\":$id}"
}

perfil_postulante() {
    token="$1"
    curl -s "$B/api/postulante/perfil" -H "Authorization: Bearer $token"
}

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

HOY=$(php -r 'echo date("Y-m-d");')
FUTURO=$(php -r 'echo date("Y-m-d", strtotime("+30 days"));')
AYER=$(php -r 'echo date("Y-m-d", strtotime("-1 day"));')

printf '\n== preparación del postulante ==\n'
PERFIL=0
PERFIL=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/postulante/perfil" \
    -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' \
    -d '{"nombres":"Ana","apellidos":"Torres Rojas","email":"ana.torres@mail.com","telefono":"987654321","direccion":"Av. Chiclayo 100","distrito":"José Leonardo Ortiz","fecha_nacimiento":"1990-01-15","tipo_documento":"DNI","numero_documento":"12345678"}')
check_code 'completar perfil de postulante' 200 "$PERFIL"

CV=0
CV=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" \
    -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-reglas.pdf")
check_code 'cargar CV para postular' 201 "$CV"

printf '\n== vencimiento de oferta ==\n'
H=$(crear_oferta "$TE" "Oferta del último día" "$HOY" | id_json)
check_code 'aprobar oferta del último día' 200 "$(aprobar_oferta "$TA" "$H")"
if curl -s "$B/api/ofertas" | H="$H" python3 -c 'import os,sys,json; d=json.load(sys.stdin).get("data",[]); assert any(o.get("id")==int(os.environ["H"]) for o in d)'; then
    ok 'oferta del último día sigue disponible'
else
    fail 'oferta del último día no aparece en búsqueda'
fi

V=$(crear_oferta "$TE" "Oferta que vence" "$FUTURO" | id_json)
check_code 'aprobar oferta de vencimiento' 200 "$(aprobar_oferta "$TA" "$V")"

php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
$stmt = $pdo->prepare("UPDATE ofertas SET fecha_cierre = ? WHERE id = ?");
$stmt->execute([$argv[1], (int) $argv[2]]);
' "$AYER" "$V" || fail 'preparar fecha de cierre vencida'

VISIBLE=$(curl -s "$B/api/ofertas" | V="$V" python3 -c 'import os,sys,json; d=json.load(sys.stdin).get("data",[]); print(any(o.get("id")==int(os.environ["V"]) for o in d))')
if [ "$VISIBLE" = "False" ]; then ok 'oferta vencida no aparece en búsqueda pública'; else fail 'oferta vencida sigue visible en búsqueda pública'; fi

DETALLE=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/ofertas/$V")
check_code 'detalle público de oferta vencida' 404 "$DETALLE"

POST_VENCIDA=$(postular "$TP" "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("success"), d.get("message",""))')
if printf '%s' "$POST_VENCIDA" | grep -q '^False'; then ok 'postulación directa a oferta vencida bloqueada'; else fail 'postulación directa a oferta vencida no bloqueada'; fi

ADMIN_PUBLICADAS=$(curl -s "$B/api/admin/ofertas?estado=publicada" -H "Authorization: Bearer $TA")
if printf '%s' "$ADMIN_PUBLICADAS" | V="$V" python3 -c 'import os,sys,json; d=json.load(sys.stdin).get("data",[]); assert all(o.get("id")!=int(os.environ["V"]) for o in d)'; then
    ok 'bandeja Publicadas excluye ofertas vencidas'
else
    fail 'bandeja Publicadas incluye oferta vencida'
fi

ADMIN_VENCIDAS=$(curl -s "$B/api/admin/ofertas?estado=vencida" -H "Authorization: Bearer $TA")
if printf '%s' "$ADMIN_VENCIDAS" | V="$V" python3 -c 'import os,sys,json; d=json.load(sys.stdin).get("data",[]); o=next((x for x in d if x.get("id")==int(os.environ["V"])), None); assert o and o.get("estado_efectivo")=="vencida" and o.get("estado")=="publicada"'; then
    ok 'bandeja Vencidas muestra estado efectivo y conserva estado persistido'
else
    fail 'bandeja Vencidas no muestra la oferta con estado_efectivo=vencida'
fi

DETALLE_ADMIN=$(curl -s "$B/api/admin/ofertas/$V" -H "Authorization: Bearer $TA")
if printf '%s' "$DETALLE_ADMIN" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d["estado_efectivo"]=="vencida" and d["estado"]=="publicada"'; then
    ok 'detalle administrativo distingue vencida de cerrada'
else
    fail 'detalle administrativo no expone estado efectivo vencida'
fi

LISTA_EMPRESA=$(curl -s "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE")
if printf '%s' "$LISTA_EMPRESA" | V="$V" python3 -c 'import os,sys,json; d=json.load(sys.stdin).get("data",[]); o=next((x for x in d if x.get("id")==int(os.environ["V"])), None); assert o and o.get("estado_efectivo")=="vencida"'; then
    ok 'bandeja de empresa muestra la oferta como vencida'
else
    fail 'bandeja de empresa no muestra la oferta como vencida'
fi

check_code 'cierre manual de oferta vencida (empresa)' 409 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/ofertas/$V/cerrar" -H "Authorization: Bearer $TE")"
check_code 'cierre manual de oferta vencida (admin)' 409 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/$V/cerrar" -H "Authorization: Bearer $TA")"
check_code 'edición de oferta vencida' 409 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/ofertas/$V" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Intento de reapertura","vacantes":1,"descripcion":"Descripción","funciones":"Funciones"}')"
check_code 'observación de oferta vencida' 409 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/ofertas/$V/observar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"observacion":"Intento"}')"

DASH_ADMIN=$(curl -s "$B/api/admin/dashboard" -H "Authorization: Bearer $TA")
if printf '%s' "$DASH_ADMIN" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d["ofertas"]["vencida"] >= 1'; then
    ok 'dashboard administrativo contabiliza ofertas vencidas'
else
    fail 'dashboard administrativo no contabiliza ofertas vencidas'
fi

DASH_EMPRESA=$(curl -s "$B/api/empresa/dashboard" -H "Authorization: Bearer $TE")
if printf '%s' "$DASH_EMPRESA" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d["ofertas"]["vencida"] >= 1'; then
    ok 'dashboard de empresa contabiliza ofertas vencidas'
else
    fail 'dashboard de empresa no contabiliza ofertas vencidas'
fi

EMPLEABILIDAD=$(curl -s "$B/api/admin/empleabilidad" -H "Authorization: Bearer $TA")
if printf '%s' "$EMPLEABILIDAD" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d["ofertas_vigentes"] >= 0 and isinstance(d["empresas"], list)'; then
    ok 'empleabilidad usa la vigencia efectiva de las ofertas'
else
    fail 'empleabilidad no responde con la vigencia efectiva'
fi

printf '\n== selección formal por empresa ==\n'
Y1=$(crear_oferta "$TE" "Oferta temporal A1" "$FUTURO" | id_json)
check_code 'aprobar oferta temporal A1' 200 "$(aprobar_oferta "$TA" "$Y1")"
P1=$(postular "$TP" "$Y1" | id_json)
ok "postulación pendiente creada (id $P1)"
check_code 'marcar postulación como no seleccionada' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$P1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"no_seleccionado"}')"

Y2=$(crear_oferta "$TE" "Oferta temporal A2" "$FUTURO" | id_json)
check_code 'aprobar oferta temporal A2' 200 "$(aprobar_oferta "$TA" "$Y2")"
P2=$(postular "$TP" "$Y2" | id_json)
ok "postulación a A2 permitida con estados pendiente/no seleccionado (id $P2)"

P_SEED=$(curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; p=next(x for x in d if x["puesto"]=="Operario de construcción" and x["activo"]==1); print(p["id"])')
check_code 'pasar postulación base a en revisión' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$P_SEED/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}')"
check_code 'seleccionar formalmente al postulante' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$P_SEED/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}')"

Y3=$(crear_oferta "$TE" "Oferta temporal A3" "$FUTURO" | id_json)
check_code 'aprobar oferta temporal A3' 200 "$(aprobar_oferta "$TA" "$Y3")"

DETALLE_SEL=$(curl -s "$B/api/ofertas/$Y3" -H "Authorization: Bearer $TP")
if printf '%s' "$DETALLE_SEL" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d.get("ya_seleccionado_empresa") is True'; then
    ok 'detalle informa selección previa en la misma empresa'
else
    fail 'detalle no informa selección previa en la misma empresa'
fi

POST_BLOQUEADA=$(postular "$TP" "$Y3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("success"), d.get("message",""))')
if printf '%s' "$POST_BLOQUEADA" | grep -qE '^False.*seleccionado'; then ok 'postulación a otra oferta de la misma empresa bloqueada'; else fail 'postulación a otra oferta de la misma empresa no bloqueada'; fi

# La postulación seleccionada no pierde el bloqueo al desactivarse.
check_code 'desactivar postulación seleccionada' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$P_SEED/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":false}')"
POST_TRAS_DESACTIVAR=$(postular "$TP" "$Y3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("success"), d.get("message",""))')
if printf '%s' "$POST_TRAS_DESACTIVAR" | grep -qE '^False.*seleccionado'; then ok 'bloqueo persiste tras desactivar la postulación seleccionada'; else fail 'desactivar la postulación seleccionada elude la regla'; fi

# Otra empresa no queda bloqueada por la selección de A.
CREATE_B=$(curl -s -o /tmp/opencode/reglas_empresa_b.json -w '%{http_code}' -X POST "$B/api/admin/empresas" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"ruc":"20607777777","razon_social":"Otra Empresa Reglas SAC","evaluacion_presencial":true,"password":"Otra12345!"}')
check_code 'crear empresa B' 201 "$CREATE_B"
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20607777777","password":"Otra12345!"}' | tok)

check_code 'empresa ajena no puede cambiar la postulación de A' 404 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$P_SEED/estado" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}')"

Y4=$(crear_oferta "$TE2" "Oferta de empresa B" "$FUTURO" | id_json)
check_code 'aprobar oferta de empresa B' 200 "$(aprobar_oferta "$TA" "$Y4")"
P4=$(postular "$TP" "$Y4" | id_json)
ok "postulación a empresa B permitida (id $P4)"

DETALLE_B=$(curl -s "$B/api/ofertas/$Y4" -H "Authorization: Bearer $TP")
if printf '%s' "$DETALLE_B" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; assert d.get("ya_seleccionado_empresa") is not True'; then
    ok 'detalle de otra empresa no se marca como bloqueado'
else
    fail 'detalle de otra empresa se marca incorrectamente como bloqueado'
fi

printf '\nFIN reglas de ofertas y selección\n'
[ "$fallos" -eq 0 ] || exit 1
