#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
env 'storage.driver=local' php spark serve > /tmp/opencode/spark.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

echo "== 1. registrar contrato sobre postulación PENDIENTE => 409 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"postulacion_id":1,"fecha_contratacion":"2026-09-03","cargo":"Operario"}'

echo "== 2. avance hasta seleccionado =="
for s in en_revision preseleccionado contactado seleccionado; do
  curl -s -o /dev/null -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d "{\"estado\":\"$s\"}"
done
echo "estado ahora:"; curl -s "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["estado"])'

echo "== 3. opciones de contratación =="
curl -s "$B/api/empresa/contrataciones/opciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(len(d),"opción(es)")'

echo "== 4. registrar contratación => 201; duplicado => 409 =="
C=$(curl -s -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"postulacion_id":1,"fecha_contratacion":"2026-09-03","cargo":"Operario de construcción","modalidad":"Plazo fijo","remuneracion":"1130.00","observaciones":"Inicio inmediato"}')
echo "$C"
CID=$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "duplicado http:%{http_code} (409)\n" -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"postulacion_id":1,"fecha_contratacion":"2026-09-04","cargo":"Otro"}'

echo "== 5. editar contrato => 200 =="
curl -s -o /dev/null -w "update http:%{http_code} (200)\n" -X PUT "$B/api/empresa/contrataciones/$CID" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"fecha_contratacion":"2026-09-05","cargo":"Operario de construcción","remuneracion":"1200.00"}'

echo "== 6. listar contratos de la empresa =="
curl -s "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;[print(" -",c["id"],c["nombres"],c["puesto"],c["cargo"],c["remuneracion"]) for c in json.load(sys.stdin)["data"]]'

echo "== 7. admin: reportes con rango y contrataciones =="
curl -s "$B/api/admin/reportes?desde=2026-01-01&hasta=2026-12-31" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];i=d["indicadores"];print("seleccionados:",i["seleccionados"],"tasa_sel:",i["tasa_seleccion"],"tasa_cont:",i["tasa_contratacion"],"tiempo_sel:",i["tiempo_promedio_seleccion_dias"]);print("contratos en reporte:",len(d["contrataciones"]))'
curl -s "$B/api/admin/contrataciones" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("admin contrataciones:",len(d),"-",d[0]["razon_social"],d[0]["nombres"])'

echo "== 8. permisos: postulante no registra contratos => 403 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"postulacion_id":1,"fecha_contratacion":"2026-09-03","cargo":"X"}'

echo
echo "FIN fase 6"
