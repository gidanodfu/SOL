#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Creación de oportunidades: todos los campos existentes son obligatorios.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_oportunidades_campos.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %-54s %s\n' "$nombre" "$real"; else printf 'FAIL %-54s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
check_campo() {
    archivo="$1"; campo="$2"; mensaje="$3"
    if python3 - "$archivo" "$campo" "$mensaje" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
campos = d.get('campos') or {}
assert campos.get(sys.argv[2]) == sys.argv[3], campos
assert isinstance(d.get('errors'), (list, dict)), d
PY
    then
        printf 'OK   %-54s %s\n' "error de $campo" "$campo"
    else
        printf 'FAIL %-54s %s\n' "error de $campo" "$campo"
        fallos=$((fallos + 1))
    fi
}

post() {
    curl -s -o /tmp/opencode/op_campos.json -w '%{http_code}' -X POST "$B/api/admin/oportunidades" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "$1"
}
id_actual() { python3 -c 'import json;print(json.load(open("/tmp/opencode/op_campos.json"))["data"]["id"])'; }
contar() { curl -s "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))'; }

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
HOY=$(php -r 'echo date("Y-m-d");')

BASE='{"fuente":"empleos_peru","titulo":"Operarios para Lima","enlace":"https://empleosperu.gob.pe/oferta/1","fecha_publicacion":"'"$HOY"'","descripcion":"Convocatoria externa"}'

paso "1. cada campo obligatorio"
ANTES=$(contar)
for CAMPO in fuente titulo enlace fecha_publicacion descripcion; do
    python3 - "$CAMPO" "$BASE" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[2])
d.pop(sys.argv[1], None)
print(json.dumps(d))
PY
    CODE=$(post @/tmp/opencode/op_campos_payload.json)
    check_code "crear sin $CAMPO" 422 "$CODE"
    case "$CAMPO" in
        fuente) MENSAJE='Selecciona una fuente válida.' ;;
        titulo) MENSAJE='El título de la oportunidad es obligatorio.' ;;
        enlace) MENSAJE='Introduce una URL válida.' ;;
        fecha_publicacion) MENSAJE='La fecha de publicación es obligatoria.' ;;
        descripcion) MENSAJE='La descripción de la oportunidad es obligatoria.' ;;
    esac
    check_campo /tmp/opencode/op_campos.json "$CAMPO" "$MENSAJE"
done

paso "2. valores inválidos"
python3 - "$BASE" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['fuente'] = 'fuente_inexistente'
print(json.dumps(d))
PY
check_code 'fuente inválida' 422 "$(post @/tmp/opencode/op_campos_payload.json)"
check_campo /tmp/opencode/op_campos.json fuente 'Selecciona una fuente válida.'

python3 - "$BASE" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['titulo'] = '    '
print(json.dumps(d))
PY
check_code 'título solo con espacios' 422 "$(post @/tmp/opencode/op_campos_payload.json)"
check_campo /tmp/opencode/op_campos.json titulo 'El título de la oportunidad es obligatorio.'

for URL in '' 'no-es-url' 'javascript:alert(1)' 'data:text/html;base64,abc' 'ftp://example.com/x'; do
    python3 - "$BASE" "$URL" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['enlace'] = sys.argv[2]
print(json.dumps(d))
PY
    check_code "URL inválida (${URL:-vacía})" 422 "$(post @/tmp/opencode/op_campos_payload.json)"
    check_campo /tmp/opencode/op_campos.json enlace 'Introduce una URL válida.'
done

for FECHA in '' '2026-13-01' '2026-02-31' '01/12/2026'; do
    python3 - "$BASE" "$FECHA" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['fecha_publicacion'] = sys.argv[2]
print(json.dumps(d))
PY
    check_code "fecha inválida (${FECHA:-vacía})" 422 "$(post @/tmp/opencode/op_campos_payload.json)"
    if [ -z "$FECHA" ]; then
        MENSAJE='La fecha de publicación es obligatoria.'
    else
        MENSAJE='La fecha de publicación no es válida.'
    fi
    check_campo /tmp/opencode/op_campos.json fecha_publicacion "$MENSAJE"
done

for DESC in '' '   ' '<p></p>' '<p><br></p>'; do
    python3 - "$BASE" "$DESC" > /tmp/opencode/op_campos_payload.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['descripcion'] = sys.argv[2]
print(json.dumps(d))
PY
    check_code "descripción vacía/HTML vacío" 422 "$(post @/tmp/opencode/op_campos_payload.json)"
    check_campo /tmp/opencode/op_campos.json descripcion 'La descripción de la oportunidad es obligatoria.'
done

DESPUES=$(contar)
[ "$ANTES" = "$DESPUES" ] && echo 'OK   los rechazos no crearon oportunidades' || { echo 'FAIL los rechazos crearon oportunidades'; fallos=$((fallos + 1)); }

paso "3. creación válida y edición existente"
CODE=$(post "$BASE")
check_code 'crear con todos los campos válidos' 201 "$CODE"
ID=$(id_actual)
contar | grep -qx "$((ANTES + 1))" && echo 'OK   se creó exactamente una oportunidad' || { echo 'FAIL recuento tras creación'; fallos=$((fallos + 1)); }

# La edición conserva su comportamiento anterior: fuente y título siguen siendo
# el mínimo del contrato existente y no se exigen fecha/enlace/descripción.
CODE=$(curl -s -o /tmp/opencode/op_campos_edit.json -w '%{http_code}' -X PUT "$B/api/admin/oportunidades/$ID" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"fuente":"empleos_peru","titulo":"Título editado"}')
check_code 'edición conserva contrato anterior' 200 "$CODE"

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -80 "$LOG"
fi
echo 'FIN test_oportunidades_campos'
[ "$fallos" -eq 0 ] || exit 1
