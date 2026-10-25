#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Validación de creación de ofertas: catálogo de ubicaciones, campos
# obligatorios, editores enriquecidos, fechas y compatibilidad histórica.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_ofertas_campos.log
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

payload() {
    python3 - "$@" <<'PY'
import json, sys

base = {
    "puesto": "Oferta de prueba",
    "categoria_id": 1,
    "tipo_empleo": "tiempo_completo",
    "ubicacion": sys.argv[1],
    "vacantes": 2,
    "remuneracion": "1250.50",
    "formacion_requerida": "Secundaria completa",
    "experiencia_requerida": "6 meses",
    "fecha_cierre": sys.argv[2],
    "habilidades": ["Excel", "Atención al cliente"],
    "descripcion": "<p>Descripción válida del puesto.</p>",
    "funciones": "<p>Funciones válidas del puesto.</p>",
    "requisitos": "<p>Requisitos válidos del puesto.</p>",
}
if base["fecha_cierre"] == "__NULL__":
    base["fecha_cierre"] = None

for cambio in sys.argv[3:]:
    clave, valor = cambio.split("=", 1)
    if valor == "__DROP__":
        base.pop(clave, None)
    elif valor == "__EMPTY__":
        base[clave] = ""
    elif valor == "__NULL__":
        base[clave] = None
    elif valor == "__HTML_EMPTY__":
        base[clave] = "<p><br></p>"
    elif valor.startswith("__JSON__"):
        base[clave] = json.loads(valor[8:])
    else:
        base[clave] = valor

print(json.dumps(base, ensure_ascii=False))
PY
}

contar_ofertas() {
    curl -s "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" \
        | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;print(len(d["data"]))'
}

probar_rechazo() {
    nombre="$1"; body="$2"
    antes=$(contar_ofertas)
    code=$(curl -s -o /tmp/opencode/oferta_invalida.json -w '%{http_code}' \
        -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" \
        -H 'Content-Type: application/json' -d "$body")
    despues=$(contar_ofertas)
    if [ "$code" = "422" ] && [ "$antes" = "$despues" ]; then
        ok "$nombre (422, sin alta)"
    else
        fail "$nombre (http $code, ofertas $antes→$despues)"
        cat /tmp/opencode/oferta_invalida.json
        printf '\n'
    fi
}

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
HOY=$(php -r 'echo date("Y-m-d");')
AYER=$(php -r 'echo date("Y-m-d", strtotime("-1 day"));')
FUTURO=$(php -r 'echo date("Y-m-d", strtotime("+30 days"));')

printf '\n== 1. ubicaciones canónicas ==\n'
for ubicacion in "Chiclayo" "José Leonardo Ortiz" "La Victoria" "Pimentel" "Lambayeque"; do
    body=$(payload "$ubicacion" "$FUTURO" "puesto=Oferta en $ubicacion")
    code=$(curl -s -o /tmp/opencode/oferta_ubicacion.json -w '%{http_code}' \
        -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" \
        -H 'Content-Type: application/json' -d "$body")
    if [ "$code" = "201" ]; then
        id=$(id_json < /tmp/opencode/oferta_ubicacion.json)
        guardada=$(curl -s "$B/api/empresa/ofertas/$id" -H "Authorization: Bearer $TE" \
            | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["ubicacion"])')
        if [ "$guardada" = "$ubicacion" ]; then
            ok "ubicación $ubicacion persistida"
        else
            fail "ubicación $ubicacion se guardó como $guardada"
        fi
    else
        fail "crear oferta en $ubicacion (http $code)"
        cat /tmp/opencode/oferta_ubicacion.json
        printf '\n'
    fi
done

printf '\n== 2. ubicación arbitraria y campos obligatorios ==\n'
probar_rechazo 'rechaza ubicación arbitraria' "$(payload 'Lima' "$FUTURO")"
probar_rechazo 'rechaza ubicación vacía' "$(payload '' "$FUTURO")"
for campo in puesto categoria_id tipo_empleo ubicacion vacantes remuneracion formacion_requerida experiencia_requerida fecha_cierre habilidades descripcion funciones requisitos; do
    probar_rechazo "rechaza $campo ausente" "$(payload 'Chiclayo' "$FUTURO" "$campo=__DROP__")"
done
probar_rechazo 'rechaza "Sin categoría"' "$(payload 'Chiclayo' "$FUTURO" 'categoria_id=__EMPTY__')"
probar_rechazo 'rechaza tipo de empleo inválido' "$(payload 'Chiclayo' "$FUTURO" 'tipo_empleo=otro')"
probar_rechazo 'rechaza placeholder de formación' "$(payload 'Chiclayo' "$FUTURO" 'formacion_requerida=Seleccione…')"
probar_rechazo 'rechaza placeholder de experiencia' "$(payload 'Chiclayo' "$FUTURO" 'experiencia_requerida=Seleccione…')"
probar_rechazo 'rechaza vacantes cero' "$(payload 'Chiclayo' "$FUTURO" 'vacantes=0')"
probar_rechazo 'rechaza vacantes decimales' "$(payload 'Chiclayo' "$FUTURO" 'vacantes=1.5')"
probar_rechazo 'rechaza salario vacío' "$(payload 'Chiclayo' "$FUTURO" 'remuneracion=__EMPTY__')"
probar_rechazo 'rechaza salario negativo' "$(payload 'Chiclayo' "$FUTURO" 'remuneracion=-1')"
probar_rechazo 'rechaza salario no numérico' "$(payload 'Chiclayo' "$FUTURO" 'remuneracion=abc')"
probar_rechazo 'rechaza fecha inválida' "$(payload 'Chiclayo' '2026-02-31')"
probar_rechazo 'rechaza fecha anterior a hoy' "$(payload 'Chiclayo' "$AYER")"
probar_rechazo 'rechaza habilidades vacías' "$(payload 'Chiclayo' "$FUTURO" 'habilidades=__JSON__[]')"
probar_rechazo 'rechaza habilidades con solo espacios' "$(payload 'Chiclayo' "$FUTURO" 'habilidades=__JSON__["  "]')"
for campo in descripcion funciones requisitos; do
    probar_rechazo "rechaza $campo con editor vacío" "$(payload 'Chiclayo' "$FUTURO" "$campo=__HTML_EMPTY__")"
done

printf '\n== 3. oferta completa válida y fecha de hoy ==\n'
body=$(payload 'Chiclayo' "$FUTURO" 'puesto=Oferta completa válida')
code=$(curl -s -o /tmp/opencode/oferta_completa.json -w '%{http_code}' \
    -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d "$body")
check_code 'crear oferta con todos los campos' 201 "$code"
if [ "$code" = "201" ]; then
    ID_COMPLETA=$(id_json < /tmp/opencode/oferta_completa.json)
    curl -s "$B/api/empresa/ofertas/$ID_COMPLETA" -H "Authorization: Bearer $TE" \
        | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];assert d["estado"]=="pendiente",d;assert d["ubicacion"]=="Chiclayo",d;assert float(d["remuneracion"])==1250.5,d;assert set(d["habilidades"])=={"Excel","Atención al cliente"},d;print("detalle completo OK")'
fi

body=$(payload 'Pimentel' "$HOY" 'puesto=Oferta que cierra hoy')
code=$(curl -s -o /tmp/opencode/oferta_hoy.json -w '%{http_code}' \
    -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d "$body")
check_code 'acepta fecha de cierre de hoy (America/Lima)' 201 "$code"

printf '\n== 4. compatibilidad con oferta histórica ==\n'
HIST_ID=$(HOY="$HOY" php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$empresaId = (int) $pdo->query("SELECT id FROM empresas WHERE ruc = \"20601234567\"")->fetchColumn();
$stmt = $pdo->prepare("INSERT INTO ofertas (empresa_id, puesto, descripcion, funciones, requisitos, formacion_requerida, experiencia_requerida, tipo_empleo, ubicacion, remuneracion, vacantes, fecha_cierre, estado, created_at, updated_at) VALUES (?, \"Oferta histórica\", \"<p>Descripción histórica</p>\", \"<p>Funciones históricas</p>\", NULL, NULL, NULL, \"tiempo_completo\", \"JLO\", NULL, 1, NULL, \"borrador\", NOW(), NOW())");
$stmt->execute([$empresaId]);
echo (int) $pdo->lastInsertId();
')
body=$(payload 'JLO' '__NULL__' \
    'puesto=Oferta histórica' \
    'categoria_id=__NULL__' \
    'remuneracion=__NULL__' \
    'formacion_requerida=__NULL__' \
    'experiencia_requerida=__NULL__' \
    'requisitos=__NULL__' \
    'habilidades=__JSON__[]')
code=$(curl -s -o /tmp/opencode/oferta_historica.json -w '%{http_code}' \
    -X PUT "$B/api/empresa/ofertas/$HIST_ID" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d "$body")
check_code 'edita oferta histórica conservando ubicación y fecha nulas' 200 "$code"
curl -s "$B/api/empresa/ofertas/$HIST_ID" -H "Authorization: Bearer $TE" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];assert d["ubicacion"]=="JLO";assert d["fecha_cierre"] is None;assert d["remuneracion"] is None;print("datos históricos preservados OK")'

body=$(payload 'Lima' '__NULL__' \
    'puesto=Oferta histórica' \
    'categoria_id=__NULL__' \
    'remuneracion=__NULL__' \
    'formacion_requerida=__NULL__' \
    'experiencia_requerida=__NULL__' \
    'requisitos=__NULL__' \
    'habilidades=__JSON__[]')
code=$(curl -s -o /tmp/opencode/oferta_historica_invalida.json -w '%{http_code}' \
    -X PUT "$B/api/empresa/ofertas/$HIST_ID" -H "Authorization: Bearer $TE" \
    -H 'Content-Type: application/json' -d "$body")
check_code 'no permite cambiar ubicación histórica por una arbitraria' 422 "$code"
curl -s "$B/api/empresa/ofertas/$HIST_ID" -H "Authorization: Bearer $TE" \
    | python3 -c 'import sys,json;assert json.load(sys.stdin)["data"]["ubicacion"]=="JLO";print("ubicación histórica intacta OK")'

printf '\nFIN validación de ofertas\n'
[ "$fallos" -eq 0 ] || exit 1
