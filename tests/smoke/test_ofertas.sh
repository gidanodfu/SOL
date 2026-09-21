#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
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

paso "2. crear oferta borrador"
C=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Asistente contable","categoria_id":1,"tipo_empleo":"tiempo_completo","ubicacion":"Chiclayo","vacantes":1,"descripcion":"Apoyo en área contable","requisitos":"Contabilidad técnica","habilidades":["Excel","Sunat"],"remuneracion":"1200.50","fecha_cierre":"2026-12-31"}')
echo "$C"
ID2=$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')

paso "3. editar oferta publicada (id1) => 200 y permanece publicada (regla nueva)"
curl -s -o /dev/null -w "editar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/1" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Cambiado","vacantes":1}'
curl -s "$B/api/empresa/ofertas/1" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| puesto:",d["puesto"])'

paso "4. publicar directo id2 (flujo vigente, sin revisión municipal)"
curl -s -o /dev/null -w "publicar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/publicar" -H "Authorization: Bearer $TE"
paso "4b. publicar de nuevo => 409"
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/publicar" -H "Authorization: Bearer $TE"

paso "5. admin bandeja publicadas"
curl -s "$B/api/admin/ofertas?estado=publicada" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(len(d),"publicada(s); id2 presente:",any(o["id"]==int("'$ID2'") for o in d))'
curl -s "$B/api/admin/ofertas/$ID2" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"publicacion:",d["fecha_publicacion"],"habilidades:",d["habilidades"])'

paso "6. endpoints heredados retirados => 404"
curl -s -o /dev/null -w "revision http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID2/revision" -H "Authorization: Bearer $TE"
curl -s -o /dev/null -w "aprobar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/aprobar" -H "Authorization: Bearer $TA"
curl -s -o /dev/null -w "rechazar http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"motivo":"duplicada"}'

paso "7. admin cierra la oferta publicada id2"
curl -s -o /dev/null -w "cerrar admin http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/cerrar" -H "Authorization: Bearer $TA"
curl -s "$B/api/admin/ofertas/$ID2" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print("estado:",json.load(sys.stdin)["data"]["estado"])'
curl -s -o /dev/null -w "cerrar de nuevo => 409 http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$ID2/cerrar" -H "Authorization: Bearer $TA"

paso "8. nueva oferta id3: editar borrador y publicar"
ID3=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Vendedor","vacantes":2}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "editar borrador http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID3" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Vendedor mejorado","vacantes":2}'
curl -s -o /dev/null -w "publicar id3 http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$ID3/publicar" -H "Authorization: Bearer $TE"
curl -s "$B/api/empresa/ofertas/$ID3" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"puesto:",d["puesto"])'

paso "10. oferta ajena: crear 2da empresa y verificar 404"
curl -s -o /dev/null -w "crear 2da empresa http:%{http_code}\n" -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"ruc":"20608888888","razon_social":"Ferreteria Norte EIRL","evaluacion_presencial":true,"password":"Norte12345!"}'
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20608888888","password":"Norte12345!"}' | tok)
curl -s -o /dev/null -w "empresa2 lee oferta de empresa1 (id2) http:%{http_code}\n" "$B/api/empresa/ofertas/$ID2" -H "Authorization: Bearer $TE2"

paso "11. categorias (cualquier rol)"
curl -s "$B/api/categorias" -H "Authorization: Bearer $TE2" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]),"categorías")'

echo
echo "FIN fase 2"
