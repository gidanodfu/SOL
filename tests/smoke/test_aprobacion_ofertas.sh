#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Flujo de revisión municipal de ofertas (Fase 1-4): la empresa envía a revisión,
# solo la Municipalidad aprueba/rechaza, y los postulantes solo ven aprobadas.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark.log

env 'storage.driver=local' php spark serve > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

paso "1. empresa crea oferta => pendiente"
C=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Carpintero de obra","tipo_empleo":"tiempo_completo","ubicacion":"JLO","vacantes":2,"fecha_cierre":"2026-12-31"}')
OID=$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s "$B/api/empresa/ofertas/$OID" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"])'

paso "2. no aparece en la bolsa pública"
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$OID'") for o in d))'

paso "3. la empresa NO puede aprobar (403)"
curl -s -o /dev/null -w "empresa aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$OID/aprobar" -H "Authorization: Bearer $TE"

paso "4. el postulante NO puede aprobar (403)"
curl -s -o /dev/null -w "postulante aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$OID/aprobar" -H "Authorization: Bearer $TP"

paso "5. admin ve la pendiente en su bandeja"
curl -s "$B/api/admin/ofertas?estado=pendiente" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("pendientes:",len(d),"| primera:",d[0]["estado"] if d else "-","| contiene:",any(o["id"]==int("'$OID'") for o in d))'

paso "6. admin aprueba => publicada y visible"
curl -s -o /dev/null -w "aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$OID/aprobar" -H "Authorization: Bearer $TA"
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$OID'") for o in d))'
curl -s "$B/api/admin/ofertas/$OID" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| validado_por:",d["validado_por"],"| fecha_validacion:",d["fecha_validacion"])'

paso "7. aprobar de nuevo => 409"
curl -s -o /dev/null -w "reaprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$OID/aprobar" -H "Authorization: Bearer $TA"

paso "8. segunda oferta: rechazo municipal"
ID2=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Oferta a rechazar","vacantes":1}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "rechazar sin motivo => 422 http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w "rechazar con motivo http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"motivo":"Datos incompletos"}'
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| motivo:",d["motivo_rechazo"])'
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$ID2'") for o in d))'

paso "9. mass assignment: la empresa no puede forzar publicada/estado"
curl -s -o /dev/null -w "editar rechazada http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Oferta corregida","vacantes":1,"estado":"publicada","validado_por":1}'
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| puesto:",d["puesto"])'

paso "10. la empresa reenvía a revisión y el admin aprueba"
curl -s -o /dev/null -w "enviar-revision http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/enviar-revision" -H "Authorization: Bearer $TE"
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| motivo:",d["motivo_rechazo"])'
curl -s -o /dev/null -w "aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/aprobar" -H "Authorization: Bearer $TA"

paso "11. editar una publicada la devuelve a revisión"
curl -s -o /dev/null -w "editar publicada http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Oferta corregida v2","vacantes":1}'
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"])'
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$ID2'") for o in d))'

paso "12. la empresa no puede reenviar algo ya en revisión"
curl -s -o /dev/null -w "reenviar pendiente http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/enviar-revision" -H "Authorization: Bearer $TE"

paso "13. postulante no accede a rutas de empresa (403)"
curl -s -o /dev/null -w "postulante crear oferta http:%{http_code}\n" -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"puesto":"No permitido","vacantes":1}'

paso "14. endpoint retirado de publicación directa => 404"
curl -s -o /dev/null -w "publicar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$OID/publicar" -H "Authorization: Bearer $TE"

echo
echo "FIN test_aprobacion_ofertas"
