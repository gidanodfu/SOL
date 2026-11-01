#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Ciclo de vida de oportunidades: programación, estado efectivo, visibilidad
# pública e inmutabilidad de finalizadas (America/Lima), por HTTP directo.
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
    if [ "$real" = "$esperado" ]; then printf 'OK   %-62s %s\n' "$nombre" "$real"; else printf 'FAIL %-62s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
check_codigo() {
    archivo="$1"; esperado="$2"
    if python3 - "$archivo" "$esperado" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
assert d.get('code') == sys.argv[2], d
PY
    then printf 'OK   %-62s %s\n' "código $esperado" "$esperado"; else printf 'FAIL %-62s %s\n' "código $esperado" "$esperado"; fallos=$((fallos + 1)); fi
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
    then printf 'OK   %-62s %s\n' "$campo = $esperado" "$esperado"; else printf 'FAIL %-62s %s\n' "$campo (esperado $esperado)" "$campo"; fallos=$((fallos + 1)); fi
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
HOY=$(php -r 'echo date("Y-m-d");')
FUTURO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+2 days"));')
FUTURO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+3 days"));')
CURSO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-1 day"));')
CURSO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+1 day"));')
PASADO_INI=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-3 days"));')
PASADO_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("-2 days"));')
AHORA=$(php -r 'echo date("Y-m-d H:i:s");')
MANANA=$(php -r 'echo date("Y-m-d", strtotime("+1 day"));')

payload() {
    python3 - "$1" "$2" "$3" "$4" "$5" <<'PY'
import json, sys
print(json.dumps({
    'fuente': 'empleos_peru',
    'titulo': sys.argv[1],
    'enlace': 'https://example.com/convocatoria',
    'fecha_publicacion': sys.argv[2],
    'descripcion': '<p>Convocatoria <strong>externa</strong> con <a href="https://example.com/detalle">detalle</a>.</p>',
    'fecha_inicio': sys.argv[3],
    'fecha_fin': sys.argv[4],
    'modalidad': sys.argv[5],
}))
PY
}

crear() {
    payload "$1" "$2" "$3" "$4" "$5" > /tmp/opencode/op_ciclo_payload.json
    curl -s -o /tmp/opencode/op_ciclo_resp.json -w '%{http_code}' -X POST "$B/api/admin/oportunidades" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d @/tmp/opencode/op_ciclo_payload.json
}
id_resp() { python3 -c 'import json;print(json.load(open("/tmp/opencode/op_ciclo_resp.json"))["data"]["id"])'; }
admin_lista() { curl -s "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" > /tmp/opencode/op_ciclo_admin.json; }
publico_tiene() {
    curl -s "$B/api/oportunidades" > /tmp/opencode/op_ciclo_publico.json
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

paso "1. futura, liberada hoy: programada y visible"
CODE=$(crear 'Oportunidad futura' "$HOY" "$FUTURO_INI" "$FUTURO_FIN" 'presencial')
check_code 'crear oportunidad futura liberada' 201 "$CODE"
FUTURA=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" estado_efectivo '"programado"'
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" puede_modificarse 'true'
check_item /tmp/opencode/op_ciclo_admin.json "$FUTURA" estado_publicacion '"visible"'
publico_tiene "$FUTURA" && echo 'OK   futura programada aparece en el portal' || { echo 'FAIL futura no aparece en el portal'; fallos=$((fallos + 1)); }

paso "2. en curso: aparece en el público con estado en_curso"
CODE=$(crear 'Oportunidad en curso' "$HOY" "$CURSO_INI" "$CURSO_FIN" 'virtual')
check_code 'crear oportunidad en curso' 201 "$CODE"
CURSO=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$CURSO" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$CURSO" puede_modificarse 'true'
publico_tiene "$CURSO" && echo 'OK   oportunidad en curso aparece en el portal' || { echo 'FAIL oportunidad en curso fuera del portal'; fallos=$((fallos + 1)); }

paso "3. finalización manual: permanece en administración y sale del público"
CODE=$(crear 'Oportunidad a finalizar' "$HOY" "$FUTURO_INI" "$FUTURO_FIN" 'mixta')
check_code 'crear oportunidad para finalizar' 201 "$CODE"
MANUAL=$(id_resp)
CODE=$(cambiar_estado "$MANUAL" 'finalizado')
check_code 'finalizar manualmente' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" estado '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" estado_efectivo '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$MANUAL" puede_modificarse 'false'
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

paso "4. fecha_fin pasada: finalizada derivada, no editable y fuera del público"
CODE=$(crear 'Oportunidad vencida' "$HOY" "$PASADO_INI" "$PASADO_FIN" 'presencial')
check_code 'crear oportunidad con fin pasado' 201 "$CODE"
VENCIDA=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" estado '"programado"'
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" estado_efectivo '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$VENCIDA" puede_modificarse 'false'
publico_tiene "$VENCIDA" && { echo 'FAIL vencida aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   vencida fuera del portal'
CODE=$(actualizar "$VENCIDA" '{"fuente":"empleos_peru","titulo":"Intento vencida"}')
check_code 'editar vencida por fecha' 409 "$CODE"
check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED
CODE=$(cambiar_estado "$VENCIDA" 'cancelado')
check_code 'cancelar vencida por fecha' 409 "$CODE"
check_codigo /tmp/opencode/op_ciclo_resp.json OPPORTUNITY_ALREADY_FINALIZED

paso "5. fecha_fin exacta al momento de crear: finalizada inclusiva"
CODE=$(crear 'Oportunidad que termina ahora' "$HOY" "$PASADO_INI" "$AHORA" 'virtual')
check_code 'crear oportunidad con fin ahora' 201 "$CODE"
AHORA_ID=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$AHORA_ID" estado_efectivo '"finalizado"'
check_item /tmp/opencode/op_ciclo_admin.json "$AHORA_ID" puede_modificarse 'false'
publico_tiene "$AHORA_ID" && { echo 'FAIL oportunidad terminada ahora aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   límite de fin inclusivo fuera del portal'

paso "6. oculta por activo: no se confunde con cancelada ni finalizada"
CODE=$(crear 'Oportunidad oculta' "$HOY" "$CURSO_INI" "$CURSO_FIN" 'presencial')
check_code 'crear oportunidad para ocultar' 201 "$CODE"
OCULTA=$(id_resp)
CODE=$(activacion "$OCULTA" false)
check_code 'ocultar oportunidad activa' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" estado '"programado"'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" estado_publicacion '"oculta"'
check_item /tmp/opencode/op_ciclo_admin.json "$OCULTA" puede_modificarse 'true'
publico_tiene "$OCULTA" && { echo 'FAIL oculta aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   oculta fuera del portal sin cambiar su ciclo de vida'
CODE=$(actualizar "$OCULTA" '{"fuente":"mype_local","titulo":"Oportunidad oculta editada"}')
check_code 'editar oportunidad oculta sigue permitido' 200 "$CODE"

paso "7. fecha editorial futura: oculta aunque la programación ya comenzó"
CODE=$(crear 'Oportunidad editorial futura' "$MANANA" "$CURSO_INI" "$CURSO_FIN" 'virtual')
check_code 'crear con publicación futura' 201 "$CODE"
EDITORIAL=$(id_resp)
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$EDITORIAL" estado_efectivo '"en_curso"'
check_item /tmp/opencode/op_ciclo_admin.json "$EDITORIAL" estado_publicacion '"programada"'
publico_tiene "$EDITORIAL" && { echo 'FAIL publicación futura aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   fecha editorial futura mantiene oculta la oportunidad'

paso "8. cancelación y reapertura según transiciones"
CODE=$(crear 'Oportunidad cancelable' "$HOY" "$FUTURO_INI" "$FUTURO_FIN" 'presencial')
check_code 'crear oportunidad cancelable' 201 "$CODE"
CANCELABLE=$(id_resp)
CODE=$(cambiar_estado "$CANCELABLE" 'cancelado')
check_code 'cancelar oportunidad programada' 200 "$CODE"
admin_lista
check_item /tmp/opencode/op_ciclo_admin.json "$CANCELABLE" estado_efectivo '"cancelado"'
publico_tiene "$CANCELABLE" && { echo 'FAIL cancelada aparece en el portal'; fallos=$((fallos + 1)); } || echo 'OK   cancelada fuera del portal'
CODE=$(cambiar_estado "$CANCELABLE" 'programado')
check_code 'reabrir cancelada a programada' 200 "$CODE"

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_oportunidades_ciclo'
[ "$fallos" -eq 0 ] || exit 1
