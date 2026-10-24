#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark.log

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
fallos=0
check_code() {
  nombre="$1"; esperado="$2"; real="$3"
  if [ "$real" = "$esperado" ]; then printf 'OK   %-48s %s\n' "$nombre" "$real"; else printf 'FAIL %-48s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}

TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

echo "== 1. postulante carga CV (local) =="
CVCODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv-ana.pdf")
check_code "subir CV PDF" 201 "$CVCODE"

echo "== 2. bandeja empresa (pendiente primero) =="
curl -s "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;[print(" -",p["id"],p["nombres"],p["puesto"],p["estado"],"activo="+str(p["activo"])) for p in json.load(sys.stdin)["data"]]'

echo "== 3. detalle postulación 1 =="
curl -s "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| oferta:",d["oferta"]["puesto"],"| postulante:",d["postulante"]["dni"],d["postulante"]["nombres"],"| cv:",bool(d["postulante"]["cv"]))'

echo "== 4. CV autorizado (empresa de la postulación) =="
U=$(curl -s "$B/api/empresa/postulaciones/1/cv" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["url"])')
CLAVE=$(echo "$U" | sed 's#.*/cv/archivo/##')
curl -s -o /tmp/opencode/cv_desc.pdf -w "archivo http:%{http_code} bytes:%{size_download}\n" "$B/api/empresa/postulaciones/1/cv/archivo/$CLAVE" -H "Authorization: Bearer $TE"

echo "== 5. autorizaciones cruzadas =="
curl -s -o /dev/null -w "empresa A ve postulación 1 http:%{http_code} (esperado 200)\n" "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE"
# crear segunda empresa para cruzar
CREATE_B=$(curl -s -o /tmp/opencode/fase4_empresa_b.json -w '%{http_code}' -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"ruc":"20607777777","razon_social":"Otra SAC","evaluacion_presencial":true,"password":"Otra12345!"}')
if [ "$CREATE_B" != "201" ]; then
  printf 'FAIL crear empresa B http:%s (esperado 201)\n' "$CREATE_B"
  cat /tmp/opencode/fase4_empresa_b.json
  exit 1
fi
TE2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20607777777","password":"Otra12345!"}' | tok)
curl -s -o /dev/null -w "empresa B detalle postulación 1 http:%{http_code} (esperado 404)\n" "$B/api/empresa/postulaciones/1" -H "Authorization: Bearer $TE2"
curl -s -o /dev/null -w "empresa B cv postulación 1 http:%{http_code} (esperado 404)\n" "$B/api/empresa/postulaciones/1/cv" -H "Authorization: Bearer $TE2"
curl -s -o /dev/null -w "empresa B archivo CV postulación 1 http:%{http_code} (esperado 404)\n" "$B/api/empresa/postulaciones/1/cv/archivo/$CLAVE" -H "Authorization: Bearer $TE2"
curl -s -o /dev/null -w "empresa B cambia estado postulación 1 http:%{http_code} (esperado 404)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}'
curl -s -o /dev/null -w "empresa B activa postulación 1 http:%{http_code} (esperado 404)\n" -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"activo":true}'
curl -s -o /dev/null -w "empresa B contrata postulación 1 http:%{http_code} (esperado 404)\n" -X POST "$B/api/empresa/contrataciones" -H "Authorization: Bearer $TE2" -H 'Content-Type: application/json' -d '{"postulacion_id":1,"fecha_contratacion":"2026-09-03","cargo":"Operario"}'
curl -s -o /dev/null -w "postulante accede bandeja empresa http:%{http_code} (esperado 403)\n" "$B/api/empresa/postulaciones" -H "Authorization: Bearer $TP"

echo "== 6. transiciones de estado =="
curl -s -o /dev/null -w "pendiente->seleccionado (salto) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "pendiente->en_revision http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}'
# preseleccionado/contactado fueron retirados por la migración 2026-10-07; ya no son transiciones válidas.
curl -s -o /dev/null -w "en_revision->preseleccionado (retirado) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"preseleccionado"}'
curl -s -o /dev/null -w "preseleccionado->contactado (retirado) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"contactado"}'
curl -s -o /dev/null -w "en_revision->seleccionado http:%{http_code} (200)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "seleccionado->en_revision (terminal) http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"en_revision"}'

echo "== 7. activación bloquea cambio de estado =="
curl -s -o /dev/null -w "desactivar http:%{http_code}\n" -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":false}'
curl -s -o /dev/null -w "estado con postulación desactivada http:%{http_code} (409)\n" -X PUT "$B/api/empresa/postulaciones/1/estado" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"estado":"seleccionado"}'
curl -s -o /dev/null -w "reactivar http:%{http_code}\n" -X PUT "$B/api/empresa/postulaciones/1/activacion" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"activo":true}'

echo "== 8. historial tras cambios (DB temporal del contenedor) =="
php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"));
foreach ($pdo->query("SELECT postulacion_id, estado_anterior, estado_nuevo, created_at FROM postulacion_historial WHERE postulacion_id=1 ORDER BY id") as $r) {
    echo $r["postulacion_id"], " | ", $r["estado_anterior"], " -> ", $r["estado_nuevo"], " | ", $r["created_at"], PHP_EOL;
}
' 2>/dev/null || true

echo
echo "FIN fase 4"
[ "$fallos" -eq 0 ] || exit 1
