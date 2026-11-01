#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Ciclo de vida de oportunidades: ventana [inicio, fin), visibilidad pública
# central, ausencia de campos legados e inmutabilidad de finalizadas.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_oportunidades_ciclo.log
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
check_codigo() {
    archivo="$1"; esperado="$2"
    if python3 - "$archivo" "$esperado" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
assert d.get('code') == sys.argv[2], d
PY
    then printf 'OK   %-64s %s\n' "código $esperado" "$esperado"; else printf 'FAIL %-64s %s\n' "código $esperado" "$esperado"; fallos=$((fallos + 1)); fi
}
check_item() {
    archivo="$1"; id="$2"; campo="$3"; esperado="$4"
    if python3 - "$archivo" "$id" "$campo" "$esperado" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
filas = [x for x in d.get('data', []) if int(x['id']) == int(sys.argv[2])]
assert len(filas) == 1, 'oportunidad no encontrada'
valor = filas[0].get(sys.argv[3])
assert valor == json.loads(sys.argv[4]), (sys.argv[3], valor, sys.argv[4])
PY
    then printf 'OK   %-64s %s\n' "$campo = $esperado" "$esperado"; else printf 'FAIL %-64s %s\n' "$campo (esperado $esperado)" "$campo"; fallos=$((fallos + 1)); fi
}
check_ausente() {
    archivo="$1"; campo="$2"
    if python3 - "$archivo" "$campo" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is True, d
filas = d.get('data', [])
if isinstance(filas, dict):
    filas = [filas]
assert all(sys.argv[2] not in x for x in filas), [x for x in filas if sys.argv[2] in x]
PY
    then printf 'OK   %-64s %s\n' "campo ausente: $campo" "$campo"; else printf 'FAIL %-64s %s\n' "campo presente: $campo" "$campo"; fallos=$((fallos + 1)); fi
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
FUTURO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+2 days"));')
FUTURO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+3 days"));')
CURSO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-1 day"));')
CURSO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+1 day"));')
PASADO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-3 days"));')
AHORA=$(php -r 'echo date("Y-m-d H:i:s");')

payload() {
    python3 - "$1" "$2" "$3" "$4" <<'PY'
import json, sys
print(json.dumps({
    'fuente': 'empleos_peru',
    'titulo': sys.argv[1],
    'enlace': 'https://example.com/convocatoria',
    'descripcion': '<p>Convocatoria <strong>externa</strong> con <a href="https://example.com/detalle">detalle</a>.</p>',
    'fecha_inicio': sys.argv[2],
    'fecha_fin': sys.argv[3],
    'modalidad': sys.argv[4],
}))
PY
}

crear() {
    payload "$1" "$2" "$3" "$4" > /tmp/opencode/op_ciclo_payload.json
    curl -s -o /tmp/opencode/op_ciclo_resp.json -w '%{http_code}' -X POST "$B/api/admin/oportunidades" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d @/tmp/opencode/op_ciclo_payload.json
}
id_resp() { python3 -c 'import json;print(json.load(open("/tmp/opencode/op_ciclo_resp.json"))["data"]["id"])'; }
admin_lista() { curl -s "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" > /tmp/opencode/op_ciclo_admin.json; }
publico_lista() { curl -s "$B/api/oportunidades" > /tmp/opencode/op_ciclo_publico.json; }
publico_tiene() {
    python3 -c '
import json, sys
d = json.load(open("/tmp/opencode/op_ciclo_publico.json"))
assert d.get("success") is True, d
sys.exit(0 if any(int(x["id"]) == int(sys.argv[1]) for x in d.get("data", [])) else 1)
' "$1"
}
actualizar() {
    curl -s -o /tmp/opencode/op_ciclo_resp.json -w '%{http_code}' -X PUT "$B/api/admin/oportunidades/$1" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "$2"
}
cambiar_estado() {
    curl -s -o /tmp/opencode/op_ciclo_resp.json -w '%{http_code}' -X PUT "$B/api/admin/oportunidades/$1/estado" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"estado\":\"$2\"}"
}
activacion() {
    curl -s -o /tmp/opencode/op_ciclo_resp.json -w '%{http_code}' -X PUT "$B/api/admin/oportunidades/$1/activacion" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"activo\":$2}"
}

paso "1. antes de inicio: programada, no pública y sin campos legados"
CODE=$(crear 'Oportunidad futura' "$FUTURO_INI" "$FUTURO_FIN" 'presencial')
check_code 'crear oportunidad futura' 201 "$CODE"
FUTURA=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" estado_efectivo '"programado"'
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" estado_publicacion '"programada"'
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" es_visible_publicamente 'false'
check_ausente /tmp/opencode/op_ciclo_admin.json fecha_publicacion
check_ausente /tmp/opencode/op_ciclo_admin.json empresa_id
check_ausente /tmp/opencode/op_ciclo_admin.json razon_social
publico_lista
publico_tiene "$FUTURA" && { echo 'FAIL futura antes de inicio aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   futura antes de inicio fuera del portal'

paso "2. dentro de la ventana: en curso y visible"
CODE=$(crear 'Oportunidad en curso' "$CURSO_INI" "$CURSO_FIN" 'virtual')
check_code 'crear oportunidad en curso' 201 "$CODE"
CURSO=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$CURSO" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$CURSO" estado_publicacion '"visible"'
check_item /tmp/opencode/op_ciclo_admin.json "$CURSO" es_visible_publicamente 'true'
publico_lista
publico_tiene "$CURSO" && echo 'OK   oportunidad en curso aparece en el portal' || { echo 'FAIL oportunidad en curso fuera del portal'; fallos=$((fallos + 1)); }
check_ausente /tmp/opencode/op_ciclo_publico.json fecha_publicacion
check_ausente /tmp/opencode/op_ciclo_publico.json empresa_id
check_ausente /tmp/opencode/op_ciclo_publico.json razon_social

paso "3. instante de inicio: en curso y público"
CODE=$(crear 'Oportunidad que inicia ahora' "$AHORA" "$CURSO_FIN" 'mixta')
check_code 'crear oportunidad con inicio ahora' 201 "$CODE"
INICIO_ID=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$INICIO_ID" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$INICIO_ID" estado_publicacion '"visible"'
publico_lista
publico_tiene "$INICIO_ID" && echo 'OK   límite de inicio inclusivo visible' || { echo 'FAIL oportunidad con inicio ahora fuera del portal'; fallos=$((fallos + 1)); }

paso "4. finalización por fecha exacta/pasada: finalizada, no visible y no editable"
CODE=$(crear 'Oportunidad que termina ahora' "$PASADO_INI" "$AHORA" 'virtual')
check_code 'crear oportunidad con fin ahora' 201 "$CODE"
VENCIDA=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" estado_efectivo '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" estado_publicacion '"no_visible"'
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" es_visible_publicamente 'false'
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" puede_modificarse 'false'
publico_lista
publico_tiene "$VENCIDA" && { echo 'FAIL vencida aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   límite de fin inclusivo fuera del portal'
CODE=$(actualizar "$VENCIDA" '{"fuente":"empleos_peru","titulo":"Intento vencida"}')
check_code 'editar vencida por fecha' 409 "$CODE"
check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED

paso "5. finalización manual: no visible y bloqueo total"
CODE=$(crear 'Oportunidad a finalizar' "$FUTURO_INI" "$FUTURO_FIN" 'presencial')
check_code 'crear oportunidad para finalizar' 201 "$CODE"
MANUAL=$(id_resp)
CODE=$(cambiar_estado "$MANUAL" 'finalizado')
check_code 'finalizar manualmente' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" estado '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" estado_efectivo '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" estado_publicacion '"no_visible"'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" es_visible_publicamente 'false'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" puede_modificarse 'false'
publico_lista
publico_tiene "$MANUAL" && { echo 'FAIL finalizada manual aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   finalizada manual fuera del portal'

CODE=$(actualizar "$MANUAL" '{"fuente":"empleos_peru","titulo":"Intento de edición"}')
check_code 'editar finalizada por HTTP directo' 409 "$CODE"
check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED
for ESTADO in programado en_curso finalizado cancelado; do
    CODE=$(cambiar_estado "$MANUAL" "$ESTADO")
    check_code "cambiar finalizada a $ESTADO" 409 "$CODE"
    check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED
done
CODE=$(activacion "$MANUAL" false)
check_code 'ocultar finalizada por HTTP directo' 409 "$CODE"
check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED

paso "6. activo = 0 dentro de la ventana: oculta, no pública"
CODE=$(crear 'Oportunidad oculta' "$CURSO_INI" "$CURSO_FIN" 'presencial')
check_code 'crear oportunidad para ocultar' 201 "$CODE"
OCULTA=$(id_resp)
CODE=$(activacion "$OCULTA" false)
check_code 'ocultar oportunidad activa' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" estado_publicacion '"oculta"'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" es_visible_publicamente 'false'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" puede_modificarse 'true'
publico_lista
publico_tiene "$OCULTA" && { echo 'FAIL oculta aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   oculta fuera del portal sin cambiar su ciclo de vida'
CODE=$(actualizar "$OCULTA" '{"fuente":"mype_local","titulo":"Oportunidad oculta editada"}')
check_code 'editar oportunidad oculta sigue permitido' 200 "$CODE"

paso "7. cancelada activa: no pública"
CODE=$(crear 'Oportunidad cancelable' "$CURSO_INI" "$CURSO_FIN" 'presencial')
check_code 'crear oportunidad cancelable' 201 "$CODE"
CANCELABLE=$(id_resp)
CODE=$(cambiar_estado "$CANCELABLE" 'cancelado')
check_code 'cancelar oportunidad en ventana' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$CANCELABLE" estado_efectivo '"cancelado"'
check_item /tmp/opencode/op_ciclo_admin.json "$CANCELABLE" estado_publicacion '"no_visible"'
check_item /tmp/opencode/op_ciclo_admin.json "$CANCELABLE" es_visible_publicamente 'false'
publico_lista
publico_tiene "$CANCELABLE" && { echo 'FAIL cancelada aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   cancelada fuera del portal'
CODE=$(cambiar_estado "$CANCELABLE" 'programado')
check_code 'reabrir cancelada a programada' 200 "$CODE"

paso "8. toda la respuesta pública carece de campos legados"
publico_lista
check_ausente /tmp/opencode/op_ciclo_publico.json fecha_publicacion
check_ausente /tmp/opencode/op_ciclo_publico.json empresa_id
check_ausente /tmp/opencode/op_ciclo_publico.json razon_social
check_ausente /tmp/opencode/op_ciclo_publico.json ruc

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_oportunidades_ciclo'
[ "$fallos" -eq 0 ] || exit 1
