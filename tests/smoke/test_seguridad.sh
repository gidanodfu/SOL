#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Endurecimiento (Fase 7): booleanos estrictos, fechas calendáricas, URL http(s),
# rate limit público, cabeceras de seguridad y mass assignment.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_seg.log

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
fallos=0
check_code() { nombre="$1"; esperado="$2"; real="$3"; if [ "$real" = "$esperado" ]; then printf 'OK   %-52s %s\n' "$nombre" "$real"; else printf 'FAIL %-52s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi; }

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)

paso "1. cabeceras de seguridad en respuestas"
curl -s -D - -o /dev/null "$B/api/categorias" | grep -iE "x-content-type-options|x-frame-options|referrer-policy|x-permitted-cross-domain"

paso "2. enlace javascript: rechazado (422); https aceptado"
IDOP=$(curl -s -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"otro","titulo":"Prueba segura","enlace":"https://example.com/convocatoria","fecha_publicacion":"2026-09-01"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"otro","titulo":"XSS","enlace":"javascript://x/%0aalert(1)"}')
check_code "enlace javascript rechazado" 422 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"otro","titulo":"FTP","enlace":"ftp://example.com/x"}')
check_code "enlace ftp rechazado" 422 "$CODE"

paso "3. activación booleana estricta (\"false\" desactiva de verdad)"
curl -s "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("activa inicial:",[o["activo"] for o in d if o["id"]==int("'$IDOP'")][0])'
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/admin/oportunidades/$IDOP/activacion" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activo":"false"}')
check_code "activación string false" 200 "$CODE"
curl -s "$B/api/admin/oportunidades?activo=0" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("desactivada:",any(o["id"]==int("'$IDOP'") for o in d))'

paso "4. editar una oportunidad desactivada NO la republica"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/admin/oportunidades/$IDOP" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"otro","titulo":"Prueba segura v2","enlace":"https://example.com/v2","fecha_publicacion":"2026-09-01"}')
check_code "editar oportunidad desactivada" 200 "$CODE"
curl -s "$B/api/admin/oportunidades?activo=0" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("sigue desactivada:",any(o["id"]==int("'$IDOP'") for o in d))'
curl -s -o /dev/null -X PUT "$B/api/admin/oportunidades/$IDOP/activacion" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activo":true}'

paso "5. fecha imposible 2026-13-01 en dashboard => 422 (no 500)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/dashboard?desde=2026-13-01&hasta=2026-12-31" -H "Authorization: Bearer $TA")
check_code "fecha dashboard inválida" 422 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/contrataciones?desde=2026-02-31" -H "Authorization: Bearer $TA")
check_code "fecha contrataciones inválida" 422 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Fecha mala","categoria_id":1,"tipo_empleo":"tiempo_completo","ubicacion":"Pimentel","vacantes":1,"remuneracion":"1000.00","formacion_requerida":"Secundaria completa","experiencia_requerida":"Sin experiencia","fecha_cierre":"2026-02-31","habilidades":["Excel"],"descripcion":"Descripción","funciones":"Funciones","requisitos":"Requisitos"}')
check_code "fecha oferta inválida" 422 "$CODE"

paso "6. mass assignment en registro: rol/estado manipulados se ignoran"
DNI=$((10000000 + RANDOM % 89999999))
curl -s -X POST "$B/api/registro/postulante" -H 'Content-Type: application/json' -d "{\"dni\":\"$DNI\",\"nombres\":\"Prueba\",\"apellidos\":\"Seguridad\",\"password\":\"Clave12345!\",\"password2\":\"Clave12345!\",\"terms_accepted\":true,\"rol\":\"admin\",\"estado\":\"inactivo\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"]["usuario"];print("rol:",d["rol"])'

paso "7. rate limit público en /verificar-ruc (ráfaga 5)"
for i in 1 2 3 4 5 6; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/verificar-ruc" -H 'Content-Type: application/json' -d '{"ruc":"20100047218"}')
  if [ "$i" -le 5 ]; then check_code "verificar-ruc intento $i" 400 "$CODE"; else check_code "verificar-ruc intento $i" 429 "$CODE"; fi
done

paso "8. activación de postulación con string false (empresa)"
PID=$(curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];a=[p["id"] for p in d if p["activo"]==1];print(a[0] if a else "")')
if [ -n "$PID" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/empresa/postulaciones/$PID/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":"false"}')
  check_code "desactivar postulación" 200 "$CODE"
  curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("activo:",[p["activo"] for p in d if p["id"]==int("'$PID'")][0])'
  curl -s -o /dev/null -X PUT "$B/api/empresa/postulaciones/$PID/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":true}'
else
  echo "sin postulación activa para probar"
fi

echo
echo "FIN test_seguridad"
[ "$fallos" -eq 0 ] || exit 1
