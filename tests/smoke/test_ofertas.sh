#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Ciclo de ofertas con revisión municipal: crear → pendiente, aprobar/rechazar
# por el admin, envío a revisión, re-revisión al editar y cierre.
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

echo "== login empresa =="
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
echo "== login admin =="
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

paso "1. listar mis ofertas (empresa)"
curl -s "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;[print(" -",o["id"],o["puesto"],o["estado"]) for o in json.load(sys.stdin)["data"]]'

paso "2. crear oferta => pendiente de revisión"
C=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Asistente contable","categoria_id":1,"tipo_empleo":"tiempo_completo","ubicacion":"Chiclayo","vacantes":1,"descripcion":"Apoyo en área contable","requisitos":"Contabilidad técnica","habilidades":["Excel","Sunat"],"remuneracion":"1200.50","fecha_cierre":"2026-12-31"}')
ID2=$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"])'

paso "3. la empresa no puede aprobar su propia oferta => 403"
curl -s -o /dev/null -w "empresa aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/aprobar" -H "Authorization: Bearer $TE"

paso "4. no aparece en la bolsa pública mientras está pendiente"
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$ID2'") for o in d))'

paso "5. admin bandeja pendientes (prioridad) y aprobación"
curl -s "$B/api/admin/ofertas?estado=pendiente" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("pendientes:",len(d),"| primera:",d[0]["estado"] if d else "-","| contiene:",any(o["id"]==int("'$ID2'") for o in d))'
curl -s -o /dev/null -w "aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/aprobar" -H "Authorization: Bearer $TA"
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$ID2'") for o in d))'
curl -s "$B/api/admin/ofertas/$ID2" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| publicacion:",d["fecha_publicacion"],"| habilidades:",d["habilidades"])'

paso "6. editar una oferta ya publicada la devuelve a revisión"
curl -s -o /dev/null -w "editar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Asistente contable v2","vacantes":1}'
curl -s "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print("estado:",json.load(sys.stdin)["data"]["estado"])'
curl -s -o /dev/null -w "reaprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/aprobar" -H "Authorization: Bearer $TA"

paso "7. nueva oferta id3: rechazo municipal con motivo"
ID3=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Vendedor","vacantes":2}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "rechazar sin motivo => 422 http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID3/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w "rechazar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID3/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"motivo":"Información incompleta"}'
curl -s "$B/api/empresa/ofertas/$ID3" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| motivo:",d["motivo_rechazo"])'
curl -s "$B/api/ofertas" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("visible:",any(o["id"]==int("'$ID3'") for o in d))'

paso "8. la empresa corrige, reenvía a revisión y el admin aprueba"
curl -s -o /dev/null -w "editar rechazada http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID3" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Vendedor de tienda","vacantes":2}'
curl -s -o /dev/null -w "enviar-revision http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID3/enviar-revision" -H "Authorization: Bearer $TE"
curl -s -o /dev/null -w "aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID3/aprobar" -H "Authorization: Bearer $TA"
curl -s "$B/api/empresa/ofertas/$ID3" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"puesto:",d["puesto"])'

paso "9. admin cierra la oferta publicada id3"
curl -s -o /dev/null -w "cerrar admin http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID3/cerrar" -H "Authorization: Bearer $TA"
curl -s "$B/api/admin/ofertas/$ID3" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print("estado:",json.load(sys.stdin)["data"]["estado"])'
curl -s -o /dev/null -w "cerrar de nuevo => 409 http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID3/cerrar" -H "Authorization: Bearer $TA"

paso "10. oferta ajena: crear 2da empresa y verificar 404"
curl -s -o /dev/null -w "crear 2da empresa http:%{http_code}\n" -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"ruc":"20608888888","razon_social":"Ferreteria Norte EIRL","evaluacion_presencial":true,"password":"Norte12345!"}'
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20608888888","password":"Norte12345!"}' | tok)
curl -s -o /dev/null -w "empresa2 lee oferta de empresa1 (id2) http:%{http_code}\n" "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE2"
curl -s -o /dev/null -w "empresa2 edita oferta de empresa1 http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"puesto":"Hackeada","vacantes":1}'
curl -s -o /dev/null -w "empresa2 reenvía oferta de empresa1 http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/enviar-revision" -H "Authorization: Bearer $TE2"

paso "11. categorias (cualquier rol)"
curl -s "$B/api/categorias" -H "Authorization: Bearer $TE2" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]),"categorías")'

paso "12. endpoints retirados => 404"
curl -s -o /dev/null -w "publicar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/publicar" -H "Authorization: Bearer $TE"
curl -s -o /dev/null -w "revision http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/revision" -H "Authorization: Bearer $TE"

echo
echo "FIN fase 2"
