#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Actividades finalizadas: solo lectura administrativa, por estado manual o
# por fecha de fin (America/Lima), incluso ante solicitudes HTTP directas.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_actividades_finalizadas.log
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
check_codigo() {
    archivo="$1"; esperado="$2"
    if python3 - "$archivo" "$esperado" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
assert d.get('code') == sys.argv[2], d
PY
    then printf 'OK   %-58s %s\n' "código $esperado" "$esperado"; else printf 'FAIL %-58s %s\n' "código $esperado" "$esperado"; fallos=$((fallos + 1)); fi
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
php -r '$im=imagecreatetruecolor(640,360); imagefill($im,0,0,imagecolorallocate($im,20,100,170)); imagejpeg($im,"/tmp/opencode/act-finalizada.jpg",85); imagedestroy($im);'

crear_actividad() {
    curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X POST "$B/api/admin/actividades" \
        -H "Authorization: Bearer $TA" -H 'Expect:' \
        -F "tipo=feria_empleo" -F "nombre=$1" -F "fecha_inicio=$2" -F "fecha_fin=$3" \
        -F 'lugar=Plaza Central' -F 'modalidad=presencial' -F 'organizador=MDJLO' \
        --form-string 'descripcion=<p>Actividad de prueba</p>' \
        -F 'imagen=@/tmp/opencode/act-finalizada.jpg;type=image/jpeg;filename=actividad.jpg'
}
id_resp() { python3 -c 'import json;print(json.load(open("/tmp/opencode/act_fin_resp.json"))["data"]["id"])'; }
item_json() {
    curl -s "$B/api/admin/actividades" -H "Authorization: Bearer $TA" > /tmp/opencode/act_fin_admin.json
    python3 - /tmp/opencode/act_fin_admin.json "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
filas = [x for x in d.get('data', []) if int(x['id']) == int(sys.argv[2])]
assert len(filas) == 1, 'actividad no encontrada'
x = filas[0]
print(json.dumps({
    'estado': x.get('estado'),
    'estado_efectivo': x.get('estado_efectivo'),
    'puede_modificarse': x.get('puede_modificarse'),
}, ensure_ascii=False))
PY
}
publico_tiene() {
    curl -s "$B/api/actividades" -H "Authorization: Bearer $TA" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d.get("success") is True, d
sys.exit(0 if any(int(x["id"]) == int(sys.argv[1]) for x in d.get("data", [])) else 1)
' "$1"
}
actualizar() {
    curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$1" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "$2"
}

FUTURO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+2 days"));')
FUTURO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+3 days"));')
PASADO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-3 days"));')
PASADO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-2 days"));')
AHORA_FIN=$(php -r 'echo date("Y-m-d H:i:s");')

paso "1. finalización manual"
CODE=$(crear_actividad 'Actividad para finalizar' "$FUTURO_INI" "$FUTURO_FIN")
check_code 'crear actividad futura' 201 "$CODE"
MANUAL=$(id_resp)
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$MANUAL/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"finalizado"}')
check_code 'finalizar manualmente' 200 "$CODE"
ITEM=$(item_json "$MANUAL")
python3 - "$ITEM" <<'PY'
import json, sys
x = json.loads(sys.argv[1])
assert x['estado'] == 'finalizado', x
assert x['estado_efectivo'] == 'finalizado', x
assert x['puede_modificarse'] is False, x
print('OK   estado finalizado y bloqueo expuesto al frontend')
PY
[ $? -eq 0 ] || { echo 'FAIL estado/bloqueo de finalizada manual'; fallos=$((fallos + 1)); }

CODE=$(actualizar "$MANUAL" "{\"tipo\":\"feria_empleo\",\"nombre\":\"Intento de edición\",\"descripcion\":\"<p>X</p>\",\"fecha_inicio\":\"$FUTURO_INI\",\"fecha_fin\":\"$FUTURO_FIN\",\"lugar\":\"Plaza\",\"modalidad\":\"presencial\",\"organizador\":\"MDJLO\"}")
check_code 'editar finalizada por HTTP directo' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
for ESTADO in programado finalizado cancelado en_curso; do
    CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$MANUAL/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"estado\":\"$ESTADO\"}")
    check_code "cambiar estado finalizada a $ESTADO" 409 "$CODE"
    check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
done
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X POST "$B/api/admin/actividades/$MANUAL/imagen" -H "Authorization: Bearer $TA" -H 'Expect:' -F 'imagen=@/tmp/opencode/act-finalizada.jpg;type=image/jpeg;filename=nueva.jpg')
check_code 'sustituir imagen de finalizada' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X DELETE "$B/api/admin/actividades/$MANUAL/imagen" -H "Authorization: Bearer $TA")
check_code 'eliminar imagen de finalizada' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/actividades/$MANUAL/imagen" -H "Authorization: Bearer $TA")
check_code 'la imagen sigue disponible para consulta' 200 "$CODE"
publico_tiene "$MANUAL" && { echo 'FAIL actividad finalizada aparece en portal público'; fallos=$((fallos + 1)); } || echo 'OK   finalizada fuera del portal público'

paso "2. finalización por fecha de fin (estado persistido anterior)"
CODE=$(crear_actividad 'Actividad vencida por fecha' "$PASADO_INI" "$PASADO_FIN")
check_code 'crear actividad con fecha de fin pasada' 201 "$CODE"
VENCIDA=$(id_resp)
ITEM=$(item_json "$VENCIDA")
python3 - "$ITEM" <<'PY'
import json, sys
x = json.loads(sys.argv[1])
assert x['estado'] == 'programado', x
assert x['estado_efectivo'] == 'finalizado', x
assert x['puede_modificarse'] is False, x
print('OK   vencida derivada como finalizada sin alterar estado persistido')
PY
[ $? -eq 0 ] || { echo 'FAIL derivación de vencida'; fallos=$((fallos + 1)); }
CODE=$(actualizar "$VENCIDA" "{\"tipo\":\"feria_empleo\",\"nombre\":\"Intento vencida\",\"descripcion\":\"<p>X</p>\",\"fecha_inicio\":\"$PASADO_INI\",\"fecha_fin\":\"$PASADO_FIN\",\"lugar\":\"Plaza\",\"modalidad\":\"presencial\",\"organizador\":\"MDJLO\"}")
check_code 'editar vencida por fecha' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$VENCIDA/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"cancelado"}')
check_code 'cancelar vencida por fecha' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X POST "$B/api/admin/actividades/$VENCIDA/imagen" -H "Authorization: Bearer $TA" -H 'Expect:' -F 'imagen=@/tmp/opencode/act-finalizada.jpg;type=image/jpeg;filename=nueva.jpg')
check_code 'imagen de vencida' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED

paso "3. fecha de fin igual al momento actual"
CODE=$(crear_actividad 'Actividad que termina ahora' "$PASADO_INI" "$AHORA_FIN")
check_code 'crear actividad que termina ahora' 201 "$CODE"
AHORA_ID=$(id_resp)
CODE=$(actualizar "$AHORA_ID" "{\"tipo\":\"feria_empleo\",\"nombre\":\"Intento ahora\",\"descripcion\":\"<p>X</p>\",\"fecha_inicio\":\"$PASADO_INI\",\"fecha_fin\":\"$AHORA_FIN\",\"lugar\":\"Plaza\",\"modalidad\":\"presencial\",\"organizador\":\"MDJLO\"}")
check_code 'editar actividad terminada ahora' 409 "$CODE"
check_codigo /tmp/opencode/act_fin_resp.json ACTIVITY_ALREADY_FINALIZED

paso "4. actividades no finalizadas conservan sus operaciones"
CODE=$(crear_actividad 'Actividad vigente editable' "$FUTURO_INI" "$FUTURO_FIN")
check_code 'crear actividad vigente' 201 "$CODE"
VIGENTE=$(id_resp)
ITEMS=$(item_json "$VIGENTE")
python3 - "$ITEMS" <<'PY'
import json, sys
x = json.loads(sys.argv[1])
assert x['puede_modificarse'] is True, x
print('OK   vigente modificable')
PY
[ $? -eq 0 ] || { echo 'FAIL vigente no modificable'; fallos=$((fallos + 1)); }
CODE=$(actualizar "$VIGENTE" "{\"tipo\":\"feria_empleo\",\"nombre\":\"Actividad vigente editada\",\"descripcion\":\"<p>Editada</p>\",\"fecha_inicio\":\"$FUTURO_INI\",\"fecha_fin\":\"$FUTURO_FIN\",\"lugar\":\"Plaza\",\"modalidad\":\"mixta\",\"organizador\":\"MDJLO\"}")
check_code 'editar actividad vigente' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X POST "$B/api/admin/actividades/$VIGENTE/imagen" -H "Authorization: Bearer $TA" -H 'Expect:' -F 'imagen=@/tmp/opencode/act-finalizada.jpg;type=image/jpeg;filename=vigente.jpg')
check_code 'sustituir imagen vigente' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X DELETE "$B/api/admin/actividades/$VIGENTE/imagen" -H "Authorization: Bearer $TA")
check_code 'eliminar imagen vigente' 200 "$CODE"

CODE=$(crear_actividad 'Actividad vigente para finalizar' "$FUTURO_INI" "$FUTURO_FIN")
check_code 'crear actividad vigente para finalizar' 201 "$CODE"
FINALIZABLE=$(id_resp)
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$FINALIZABLE/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"finalizado"}')
check_code 'finalizar actividad vigente' 200 "$CODE"

CODE=$(crear_actividad 'Actividad vigente para cancelar' "$FUTURO_INI" "$FUTURO_FIN")
check_code 'crear actividad vigente para cancelar' 201 "$CODE"
CANCELABLE=$(id_resp)
CODE=$(curl -s -o /tmp/opencode/act_fin_resp.json -w '%{http_code}' -X PUT "$B/api/admin/actividades/$CANCELABLE/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"cancelado"}')
check_code 'cancelar actividad antes de finalizar' 200 "$CODE"

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_actividades_finalizadas'
[ "$fallos" -eq 0 ] || exit 1
