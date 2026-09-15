#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark.log

env 'storage.driver=local' php spark serve > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

echo "== 1. buscar ofertas publicadas =="
curl -s "$B/api/postulante/ofertas" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;[print(" -",o["id"],o["puesto"],o["razon_social"]) for o in json.load(sys.stdin)["data"]]'
echo "== 1b. filtro q=Operario =="
curl -s "$B/api/postulante/ofertas?q=Operario" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]),"resultado(s)")'

echo "== 2. detalle oferta 1 (seed ya tiene postulación activa) =="
curl -s "$B/api/postulante/ofertas/1" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("puesto:",d["puesto"],"ya_postule:",d["ya_postule"])'

# RF-19 ajustado (Anexo 2026-09): para postular se exige contacto completo + CV
# vigente; formación/experiencia/habilidades son opcionales. El seed no trae CV
# ni fecha de nacimiento/dirección, así que se completan antes de los pasos 3-5.
echo "== 2b. completar contacto + cargar CV (RF-19 ampliado) =="
curl -s -o /dev/null -w "perfil http:%{http_code}\n" -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"nombres":"Ana","apellidos":"Torres Rojas","email":"ana.torres@mail.com","telefono":"987654321","fecha_nacimiento":"1995-04-10","direccion":"Av. Las Magnolias 320, JLO"}'
head -c 3000 /dev/urandom > /tmp/opencode/cv-fase3.pdf
curl -s -o /dev/null -w "cv http:%{http_code}\n" -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/tmp/opencode/cv-fase3.pdf;type=application/pdf;filename=cv-ana.pdf"

echo "== 3. duplicado de postulación a oferta 1 => 409 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"oferta_id":1}'

echo "== 4. empresa crea y publica oferta nueva (flujo vigente) =="
OID=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Digitador","categoria_id":1,"ubicacion":"JLO","vacantes":2,"habilidades":["Word","Excel"]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -X PUT "$B/api/empresa/ofertas/$OID/publicar" -H "Authorization: Bearer $TE"
echo "oferta nueva publicada id=$OID"

echo "== 5. postular (ok), duplicar (409), retirar, postular de nuevo (RN-14 solo activa) =="
P1=$(curl -s -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$OID}")
echo "$P1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["message"])'
curl -s -o /dev/null -w "duplicado http:%{http_code}\n" -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$OID}"
PID=$(echo "$P1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "retirar http:%{http_code}\n" -X PUT "$B/api/postulante/postulaciones/$PID/retirar" -H "Authorization: Bearer $TP"
curl -s -o /dev/null -w "repostular tras retiro http:%{http_code}\n" -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d "{\"oferta_id\":$OID}"

echo "== 6. mis postulaciones =="
curl -s "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;[print(" -",p["id"],p["puesto"],p["estado"],"activo="+str(p["activo"])) for p in json.load(sys.stdin)["data"]]'

echo "== 7. (eliminado) CRUD de secciones del perfil: la funcionalidad se retiró =="

echo "== 8. fechas inválidas => 422 =="
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$B/api/postulante/perfil" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"nombres":"Ana","apellidos":"Torres Rojas","fecha_nacimiento":"no-es-fecha"}'

echo "== 9. rol empresa no puede buscar/postular => 403 =="
curl -s -o /dev/null -w "buscar ofertas http:%{http_code}\n" "$B/api/postulante/ofertas" -H "Authorization: Bearer $TE"
curl -s -o /dev/null -w "postular http:%{http_code}\n" -X POST "$B/api/postulante/postulaciones" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"oferta_id":1}'

echo
echo "FIN fase 3"
