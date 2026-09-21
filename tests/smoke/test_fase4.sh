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

tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

echo "== 1. postulante carga CV (local) =="
head -c 4000 /dev/urandom > /tmp/opencode/cvfase4.pdf
curl -s -o /dev/null -w "subir cv http:%{http_code}\n" -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/tmp/opencode/cvfase4.pdf;type=application/pdf;filename=cv-ana.pdf"

echo "== 2. bandeja empresa (pendiente primero) =="
curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;[print(" -",p["id"],p["nombres"],p["puesto"],p["estado"],"activo="+str(p["activo"])) for p in json.load(sys.stdin)["data"]]'

echo "== 3. detalle postulación 1 =="
curl -s "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| oferta:",d["oferta"]["puesto"],"| postulante:",d["postulante"]["dni"],d["postulante"]["nombres"],"| cv:",bool(d["postulante"]["cv"]))'

echo "== 4. CV autorizado (empresa de la postulación) =="
U=$(curl -s "$B/api/empresa/postulaciones/1/cv" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["url"])')
CLAVE=$(echo "$U" | sed 's#.*/cv/archivo/##')
curl -s -o /tmp/opencode/cv_desc.pdf -w "archivo http:%{http_code} bytes:%{size_download}\n" "$B/api/empresa/postulaciones/1/cv/archivo/$CLAVE" -H "Authorization: Bearer $TE"

echo "== 5. autorizaciones cruzadas =="
curl -s -o /dev/null -w "empresa2 ve postulación 1 http:%{http_code} (esperado 404)\n" "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE"  # misma empresa, control
# crear segunda empresa para cruzar
curl -s -o /dev/null -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"ruc":"20607777777","razon_social":"Otra SAC","evaluacion_presencial":true,"password":"Otra12345!"}'
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20607777777","password":"Otra12345!"}' | tok)
curl -s -o /dev/null -w "empresa2 cv postulación 1 http:%{http_code} (esperado 404)\n" "$B/api/empresa/postulaciones/1/cv" -H "Authorization: Bearer $TE2"
curl -s -o /dev/null -w "postulante accede bandeja empresa http:%{http_code} (esperado 403)\n" "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TP"

echo "== 6. transiciones de estado =="
curl -s -o /dev/null -w "pendiente->seleccionado (salto) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "pendiente->en_revision http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}'
curl -s -o /dev/null -w "en_revision->preseleccionado http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"preseleccionado"}'
curl -s -o /dev/null -w "preseleccionado->contactado http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"contactado"}'
curl -s -o /dev/null -w "contactado->seleccionado http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "seleccionado->en_revision (terminal) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}'

echo "== 7. activación bloquea cambio de estado =="
curl -s -o /dev/null -w "desactivar http:%{http_code}\n" -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":false}'
curl -s -o /dev/null -w "estado con postulación desactivada http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "reactivar http:%{http_code}\n" -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":true}'

echo "== 8. historial tras cambios (DB) =="
docker exec empleo_mysql mysql -uempleo -pempleo123 sistema_empleo -e "SELECT postulacion_id, estado_anterior, estado_nuevo, created_at FROM postulacion_historial WHERE postulacion_id=1 ORDER BY id;" 2>/dev/null

echo
echo "FIN fase 4"
