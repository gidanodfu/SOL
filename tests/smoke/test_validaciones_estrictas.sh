#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Reglas aprobadas: contacto preservado, booleanos/IDs estrictos, fechas y
# motivo de situación laboral. Comprueba que los rechazos no escriben.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_validaciones_estrictas.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %-64s %s\n' "$nombre" "$real"; else printf 'FAIL %-64s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
check_campo() {
    archivo="$1"; campo="$2"
    if python3 - "$archivo" "$campo" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
assert isinstance(d.get('campos'), dict), d
assert isinstance(d['campos'].get(sys.argv[2]), str) and d['campos'][sys.argv[2]], d['campos']
PY
    then printf 'OK   %-64s %s\n' "campo $campo" "$campo"; else printf 'FAIL %-64s %s\n' "campo $campo" "$campo"; fallos=$((fallos + 1)); fi
}
json_get() {
    python3 - "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
actual = d['data']
for key in sys.argv[2].split('.'):
    if isinstance(actual, list):
        actual = actual[int(key)]
    else:
        actual = actual[key]
print(actual)
PY
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
HOY=$(php -r 'echo date("Y-m-d");')
MANANA=$(php -r 'echo date("Y-m-d", strtotime("+1 day"));')
AYER=$(php -r 'echo date("Y-m-d", strtotime("-1 day"));')

paso "1. postulante: email/teléfono se conservan si se omiten"
curl -s "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" > /tmp/opencode/ve_perfil_antes.json
python3 - /tmp/opencode/ve_perfil_antes.json > /tmp/opencode/ve_perfil_payload.json <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))['data']
print(json.dumps({
    'nombres': d.get('nombres') or '',
    'apellidos': d.get('apellidos') or '',
    'direccion': d.get('direccion'),
    'distrito': d.get('distrito'),
    'fecha_nacimiento': d.get('fecha_nacimiento'),
    'ocupacion': d.get('ocupacion'),
    'experiencia': d.get('experiencia'),
    'estudios': d.get('estudios'),
    'tipo_documento': d.get('tipo_documento') or 'DNI',
    'numero_documento': d.get('numero_documento') or d.get('dni') or '',
}, ensure_ascii=False))
PY
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' --data-binary @/tmp/opencode/ve_perfil_payload.json)
check_code 'actualizar perfil omitiendo contacto' 200 "$CODE"
curl -s "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" > /tmp/opencode/ve_perfil_despues.json
python3 - /tmp/opencode/ve_perfil_antes.json /tmp/opencode/ve_perfil_despues.json <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))['data']; b = json.load(open(sys.argv[2]))['data']
assert a.get('email') == b.get('email'), (a.get('email'), b.get('email'))
assert a.get('telefono') == b.get('telefono'), (a.get('telefono'), b.get('telefono'))
print('OK   contacto del postulante preservado')
PY
for VALOR in 'null' '""' '[]'; do
    python3 - "$VALOR" <<'PY' > /tmp/opencode/ve_payload.json
import json, sys
print(json.dumps({'nombres':'Ana','apellidos':'Torres Rojas','email':json.loads(sys.argv[1])}))
PY
    CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' --data-binary @/tmp/opencode/ve_payload.json)
    check_code "rechazar email $VALOR" 422 "$CODE"
    check_campo /tmp/opencode/ve_resp.json email
done
python3 - "$MANANA" <<'PY' > /tmp/opencode/ve_payload.json
import json, sys
print(json.dumps({'nombres':'Ana','apellidos':'Torres Rojas','fecha_nacimiento':sys.argv[1]}))
PY
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' --data-binary @/tmp/opencode/ve_payload.json)
check_code 'rechazar fecha de nacimiento futura' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json fecha_nacimiento

paso "2. empresa: email/teléfono se conservan si se omiten"
curl -s "$B/api/empresa/perfil" -H "Authorization: Bearer $TE" > /tmp/opencode/ve_empresa_antes.json
python3 - /tmp/opencode/ve_empresa_antes.json > /tmp/opencode/ve_empresa_payload.json <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))['data']
print(json.dumps({
    'nombre_comercial': d.get('nombre_comercial'),
    'direccion': d.get('direccion'),
    'representante': d.get('representante'),
}, ensure_ascii=False))
PY
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/perfil" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' --data-binary @/tmp/opencode/ve_empresa_payload.json)
check_code 'actualizar empresa omitiendo contacto' 200 "$CODE"
curl -s "$B/api/empresa/perfil" -H "Authorization: Bearer $TE" > /tmp/opencode/ve_empresa_despues.json
python3 - /tmp/opencode/ve_empresa_antes.json /tmp/opencode/ve_empresa_despues.json <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))['data']; b = json.load(open(sys.argv[2]))['data']
assert a.get('email') == b.get('email'), (a.get('email'), b.get('email'))
assert a.get('telefono') == b.get('telefono'), (a.get('telefono'), b.get('telefono'))
print('OK   contacto de la empresa preservado')
PY
for VALOR in 'null' '""' '[]'; do
    python3 - "$VALOR" <<'PY' > /tmp/opencode/ve_payload.json
import json, sys
print(json.dumps({'nombre_comercial':'Los Jardines','telefono':json.loads(sys.argv[1])}))
PY
    CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/perfil" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' --data-binary @/tmp/opencode/ve_payload.json)
    check_code "rechazar teléfono $VALOR" 422 "$CODE"
    check_campo /tmp/opencode/ve_resp.json telefono
done

paso "3. usuario municipal: email/teléfono se conservan si se omiten"
USR=$(curl -s "$B/api/admin/usuarios?q=moderador" -H "Authorization: Bearer $TA")
printf '%s' "$USR" > /tmp/opencode/ve_usuarios.json
USER_ID=$(python3 -c 'import json;d=json.load(open("/tmp/opencode/ve_usuarios.json"));print(d["data"]["data"][0]["id"])')
curl -s "$B/api/admin/usuarios/$USER_ID" -H "Authorization: Bearer $TA" > /tmp/opencode/ve_usuario_antes.json
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$USER_ID" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"nombres":"Moderador","apellidos":"Municipal"}')
check_code 'actualizar usuario omitiendo contacto' 200 "$CODE"
curl -s "$B/api/admin/usuarios/$USER_ID" -H "Authorization: Bearer $TA" > /tmp/opencode/ve_usuario_despues.json
python3 - /tmp/opencode/ve_usuario_antes.json /tmp/opencode/ve_usuario_despues.json <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))['data']; b = json.load(open(sys.argv[2]))['data']
assert a.get('email') == b.get('email'), (a.get('email'), b.get('email'))
assert a.get('telefono') == b.get('telefono'), (a.get('telefono'), b.get('telefono'))
print('OK   contacto del usuario preservado')
PY
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/admin/usuarios/$USER_ID" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"nombres":"Moderador","apellidos":"Municipal","email":null}')
check_code 'rechazar email nulo en usuario' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json email

paso "4. booleanos e identificadores estrictos"
OP=$(curl -s -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"fuente\":\"otro\",\"titulo\":\"Prueba estricta\",\"enlace\":\"https://example.com/prueba\",\"descripcion\":\"Prueba\",\"fecha_inicio\":\"$(php -r 'echo date("Y-m-d H:i:s", strtotime("+2 days"));')\",\"fecha_fin\":\"$(php -r 'echo date("Y-m-d H:i:s", strtotime("+3 days"));')\",\"modalidad\":\"virtual\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/admin/oportunidades/$OP/activacion" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activo":"cualquier_valor"}')
check_code 'activación de oportunidad ambigua' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json activo
curl -s "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" > /tmp/opencode/ve_oportunidades.json
python3 - "$OP" <<'PY'
import json, sys
d = json.load(open('/tmp/opencode/ve_oportunidades.json'))
x = [o for o in d['data'] if int(o['id']) == int(sys.argv[1])][0]
assert int(x['activo']) == 1, x
print('OK   activo de oportunidad no cambió')
PY

POS=$(curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["data"][0]["id"])')
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$POS/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":"cualquier_valor"}')
check_code 'activación de postulación ambigua' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json activo

ANTES_POS=$(curl -s "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"oferta_id":"15abc"}')
check_code 'oferta_id con caracteres extra' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json oferta_id
DESPUES_POS=$(curl -s "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
[ "$ANTES_POS" = "$DESPUES_POS" ] && echo 'OK   no se creó postulación con ID inválido' || { echo 'FAIL postulación creada con ID inválido'; fallos=$((fallos + 1)); }

CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"postulacion_id":"15abc","fecha_contratacion":"'"$HOY"'","cargo":"Cargo"}')
check_code 'postulacion_id con caracteres extra' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json postulacion_id

paso "5. contratación: fechas y motivo"
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$POS/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}')
check_code 'pasar postulación a revisión' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/postulaciones/$POS/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}')
check_code 'seleccionar postulación' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"postulacion_id\":$POS,\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"renuncio\",\"fecha_situacion\":\"$MANANA\",\"motivo_situacion\":\"Motivo\"}")
check_code 'fecha_situacion futura' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json fecha_situacion
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"postulacion_id\":$POS,\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"renuncio\",\"fecha_situacion\":\"$AYER\",\"motivo_situacion\":\"Motivo\"}")
check_code 'fecha_situacion anterior a contratación' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json fecha_situacion
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"postulacion_id\":$POS,\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"renuncio\",\"fecha_situacion\":\"$HOY\"}")
check_code 'renuncio sin motivo' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json motivo_situacion
CONTRATOS_ANTES=$(curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"postulacion_id\":$POS,\"fecha_contratacion\":\"$AYER\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"renuncio\",\"fecha_situacion\":\"\",\"motivo_situacion\":\"Motivo\"}")
check_code 'renuncio con motivo y fecha vacía' 201 "$CODE"
CONTRATO=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/ve_resp.json"))["data"]["id"])')
FECHA_REG=$(curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(next(c['fecha_situacion'] for c in d if c['id']==int('$CONTRATO')))")
[ "$FECHA_REG" = "$AYER" ] && echo 'OK   registro sin fecha usa la fecha de contratación' || { echo "FAIL fecha de registro: $FECHA_REG (esperado $AYER)"; fallos=$((fallos + 1)); }
CONTRATOS_DESPUES=$(curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
[ "$CONTRATOS_DESPUES" = "$((CONTRATOS_ANTES + 1))" ] && echo 'OK   solo la solicitud válida creó contratación' || { echo 'FAIL recuento de contrataciones'; fallos=$((fallos + 1)); }
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/contrataciones/$CONTRATO" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"finalizado\",\"motivo_situacion\":\"\"}")
check_code 'finalizado sin motivo permitido' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/contrataciones/$CONTRATO" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"despedido\",\"motivo_situacion\":\"\"}")
check_code 'despedido sin motivo rechazado' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json motivo_situacion
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/contrataciones/$CONTRATO" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"despedido\",\"fecha_situacion\":\"\",\"motivo_situacion\":\"Causa justificada\"}")
check_code 'despedido con motivo permitido' 200 "$CODE"
FECHA_EDIT=$(curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(next(c['fecha_situacion'] for c in d if c['id']==int('$CONTRATO')))")
[ "$FECHA_EDIT" = "$HOY" ] && echo 'OK   cambio de situación sin fecha usa la fecha actual' || { echo "FAIL fecha de edición: $FECHA_EDIT (esperado $HOY)"; fallos=$((fallos + 1)); }
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/empresa/contrataciones/$CONTRATO" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"fecha_contratacion\":\"$HOY\",\"cargo\":\"Cargo\",\"situacion_laboral\":\"despedido\",\"fecha_situacion\":\"\",\"motivo_situacion\":\"Causa justificada\"}")
check_code 'misma situación sin fecha permitida' 200 "$CODE"
FECHA_MISMA=$(curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(next(c['fecha_situacion'] for c in d if c['id']==int('$CONTRATO')))")
[ "$FECHA_MISMA" = "$HOY" ] && echo 'OK   misma situación conserva la fecha existente' || { echo "FAIL fecha preservada: $FECHA_MISMA (esperado $HOY)"; fallos=$((fallos + 1)); }

paso "6. tipos anidados y booleanos inválidos no escriben"
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"nombres":[],"apellidos":"Torres Rojas"}')
check_code 'nombres como array' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json nombres
CODE=$(curl -s -o /tmp/opencode/ve_resp.json -w '%{http_code}' -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"ruc":"20999999999","razon_social":"Empresa estricta","email":"estricta@example.test","telefono":"999888777","password":"Segura123!","evaluacion_presencial":"cualquier_valor"}')
check_code 'evaluacion_presencial ambigua' 422 "$CODE"
check_campo /tmp/opencode/ve_resp.json evaluacion_presencial

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_validaciones_estrictas'
[ "$fallos" -eq 0 ] || exit 1
