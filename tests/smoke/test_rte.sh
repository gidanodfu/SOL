#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Texto enriquecido (RTE): sanitización backend en ofertas y actividades,
# enlaces http(s), compatibilidad con texto plano y límite sobre el TEXTO
# visible (10.000), no sobre las etiquetas HTML.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_rte.log

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
fallos=0
check_code() {
  nombre="$1"; esperado="$2"; real="$3"
  if [ "$real" = "$esperado" ]; then printf 'OK   %-52s %s\n' "$nombre" "$real"; else printf 'FAIL %-52s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

paso "1. oferta con HTML permitido y payloads maliciosos"
python3 - > /tmp/opencode/rte_oferta.json <<'PY'
import json
print(json.dumps({
  "puesto": "Tester RTE",
  "categoria_id": 1,
  "tipo_empleo": "tiempo_completo",
  "ubicacion": "Chiclayo",
  "vacantes": 1,
  "remuneracion": "1500.00",
  "formacion_requerida": "Universitario",
  "experiencia_requerida": "1 año",
  "fecha_cierre": "2026-12-31",
  "habilidades": ["Pruebas"],
  "descripcion": '<p>Hola <strong>mundo</strong>.</p><script>alert(1)</script><a href="javascript:alert(1)">malo</a>',
  "funciones": '<ul><li>Función uno</li><li>Función dos</li></ul><p><img src=x onerror=alert(1)>Texto</p>',
  "requisitos": '<p style="color:red" onclick="x()">Req <iframe src="x"></iframe><svg onload=alert(1)></svg></p><p><a href="https://example.com" target="_blank">ok</a></p>',
}))
PY
CREADA=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d @/tmp/opencode/rte_oferta.json)
OID=$(echo "$CREADA" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
echo "oferta id=$OID"

paso "2. saneado persistido (GET empresa)"
curl -s "$B/api/empresa/ofertas/$OID" -H "Authorization: Bearer $TE" > /tmp/opencode/rte_detalle.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/opencode/rte_detalle.json'))['data']
for campo in ('descripcion', 'funciones', 'requisitos'):
    valor = d[campo] or ''
    for malo in ('<script', 'onerror', 'onclick', 'javascript:', '<iframe', '<svg', 'style='):
        if malo in valor.lower():
            raise SystemExit(f'FALLO: {campo} conserva {malo}: {valor}')
if '<strong>' not in (d['descripcion'] or ''):
    raise SystemExit('FALLO: descripcion perdió <strong>')
if '<ul>' not in (d['funciones'] or '') or '<li>' not in (d['funciones'] or ''):
    raise SystemExit('FALLO: funciones perdió la lista')
if 'href="https://example.com"' not in (d['requisitos'] or ''):
    raise SystemExit('FALLO: requisitos perdió el enlace https')
if 'rel="noopener noreferrer"' not in (d['requisitos'] or ''):
    raise SystemExit('FALLO: enlace sin rel forzado')
print('OK saneado ->', d['descripcion'], '|', d['funciones'])
PY

paso "3. texto plano heredado se conserva sin cambios"
python3 - > /tmp/opencode/rte_plano.json <<'PY'
import json
print(json.dumps({
    "puesto": "Tester plano",
    "categoria_id": 1,
    "tipo_empleo": "tiempo_completo",
    "ubicacion": "Pimentel",
    "vacantes": 1,
    "remuneracion": "1200.00",
    "formacion_requerida": "Secundaria completa",
    "experiencia_requerida": "6 meses",
    "fecha_cierre": "2026-12-31",
    "habilidades": ["Pruebas"],
    "descripcion": "Se requiere experiencia\n\nLinea dos",
    "funciones": "Funciones de prueba",
    "requisitos": "Requisitos de prueba",
}))
PY
PID=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d @/tmp/opencode/rte_plano.json | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s "$B/api/empresa/ofertas/$PID" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("plano conservado:", d["descripcion"] == "Se requiere experiencia\n\nLinea dos", "->", repr(d["descripcion"]))'

paso "4. límite por TEXTO visible (9.999, 10.000 pasan; 10.001 rechaza)"
for n in 9999 10000 10001; do
  python3 - "$n" > "/tmp/opencode/rte_${n}.json" <<'PY'
import json, sys
n = int(sys.argv[1])
print(json.dumps({
    "puesto": "RTE exacto " + str(n),
    "categoria_id": 1,
    "tipo_empleo": "tiempo_completo",
    "ubicacion": "Lambayeque",
    "vacantes": 1,
    "remuneracion": "1200.00",
    "formacion_requerida": "Secundaria completa",
    "experiencia_requerida": "6 meses",
    "fecha_cierre": "2026-12-31",
    "habilidades": ["Pruebas"],
    "descripcion": "<p>" + ("a" * n) + "</p>",
    "funciones": "<p>Funciones de prueba</p>",
    "requisitos": "<p>Requisitos de prueba</p>",
}))
PY
  code=$(curl -s -o "/tmp/opencode/rte_${n}.out" -w '%{http_code}' -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d @"/tmp/opencode/rte_${n}.json")
  if [ "$n" -le 10000 ]; then
    check_code "texto visible $n" 201 "$code"
  else
    check_code "texto visible $n" 422 "$code"
  fi
done

paso "5. actividad con HTML malicioso se sanea (público)"
php -r '$im=imagecreatetruecolor(640,360); imagefill($im,0,0,imagecolorallocate($im,20,100,170)); imagejpeg($im,"/tmp/opencode/rte_actividad.jpg",85); imagedestroy($im);'
AID=$(curl -s -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" \
  -F 'tipo=taller' -F 'nombre=Taller RTE' \
  -F 'fecha_inicio=2026-12-01 09:00:00' -F 'fecha_fin=2026-12-01 11:00:00' \
  -F 'lugar=Local municipal' -F 'modalidad=presencial' -F 'organizador=MDJLO' \
  --form-string 'descripcion=<p>Agenda <strong>del taller</strong></p><script>alert(1)</script><p onclick="x()">Punto dos</p>' \
  -F 'imagen=@/tmp/opencode/rte_actividad.jpg;type=image/jpeg;filename=actividad.jpg' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s "$B/api/actividades" > /tmp/opencode/rte_actividades.json
python3 - <<PY
import json
d = json.load(open('/tmp/opencode/rte_actividades.json'))['data']
act = next((a for a in d if a['id'] == int('$AID')), None)
if act is None:
    raise SystemExit('FALLO: actividad no aparece en el listado público')
desc = act['descripcion'] or ''
for malo in ('<script', 'onclick', 'javascript:'):
    if malo in desc.lower():
        raise SystemExit(f'FALLO: actividad conserva {malo}: {desc}')
if '<strong>' not in desc:
    raise SystemExit('FALLO: actividad perdió el formato permitido')
print('OK actividad saneada ->', desc)
PY

echo
echo "FIN test_rte"
[ "$fallos" -eq 0 ] || exit 1
