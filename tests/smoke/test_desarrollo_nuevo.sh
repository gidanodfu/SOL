#!/usr/bin/env bash
# Smoke de flujos nuevos de desarrollo (Anexo 2026-09):
# auto-registro de empresas (RUC SUNAT) -> aprobación admin -> enlace ->
# activación -> login por correo; publicación directa de ofertas + cierre admin;
# bolsa pública sin sesión; dashboard admin enriquecido.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_dev.log
php spark serve > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

jq_p() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(eval("d"+sys.argv[1]) if sys.argv[1].startswith("[") else d[sys.argv[1]] if sys.argv[1] in d else "")' "$1" 2>/dev/null; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

RUC=20100047218
CORREO=mesadepartes.test@credito.com.pe

echo "== 1. verificar RUC real (SUNAT) =="
curl -s -X POST "$B/api/verificar-ruc" -H 'Content-Type: application/json' -d "{\"ruc\":\"$RUC\"}"

echo "== 2. solicitar registro de empresa (debe autocompletar razon social) =="
SID=$(curl -s -X POST "$B/api/solicitudes-empresa" -H 'Content-Type: application/json' -d "{\"ruc\":\"$RUC\",\"email\":\"$CORREO\",\"telefono\":\"014214340\",\"representante\":\"Ricardo B.\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
echo "solicitud id=$SID"

echo "== 3. duplicado pendiente => 409 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/solicitudes-empresa" -H 'Content-Type: application/json' -d "{\"ruc\":\"$RUC\",\"email\":\"otro@mail.com\",\"telefono\":\"999999999\",\"representante\":\"Otro\"}"

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
echo "== 4. admin ve solicitudes pendientes =="
curl -s "$B/api/admin/solicitudes-empresa" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;[print(" -",s["id"],s["ruc"],s["razon_social"],s["estado"]) for s in json.load(sys.stdin)["data"]["data"]]'

echo "== 5. login empresa ANTES de activar (aun no existe el usuario) => 401 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$CORREO\",\"password\":\"Cualquiera1!\"}"

echo "== 6. admin aprueba => devuelve enlace =="
LINK=$(curl -s -X POST "$B/api/admin/solicitudes-empresa/$SID/aprobar" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["link"])')
echo "link=${LINK:0:60}..."
TOKEN=${LINK##*/}

echo "== 7. ver enlace público (GET activar-cuenta/token) =="
curl -s "$B/api/activar-cuenta/$TOKEN"

echo "== 8. login empresa aún inactiva (password aun no definida) => 401 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$CORREO\",\"password\":\"Clave12345!\"}"

echo "== 9. activar cuenta (define contraseña) =="
curl -s -X POST "$B/api/activar-cuenta/$TOKEN" -H 'Content-Type: application/json' -d '{"password":"Clave12345!","password2":"Clave12345!"}'

echo "== 10. login por correo corporativo => 200 =="
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$CORREO\",\"password\":\"Clave12345!\"}" | tok)
echo "token empresa: ${TE:0:20}..."

echo "== 11. login con el RUC como username => 200 (compatibilidad) =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$RUC\",\"password\":\"Clave12345!\"}"

echo "== 12. enlace reutilizado => 401 =="
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/activar-cuenta/$TOKEN"

echo "== 13. oferta: crear borrador y PUBLICAR directo (sin admin) =="
OID=$(curl -s -X POST "$B/api/empresa/ofertas" -H "Authorization: Bearer $TE" -H 'Content-Type: application/json' -d '{"puesto":"Analista contable","categoria_id":2,"ubicacion":"Lima","vacantes":1,"remuneracion":2500,"habilidades":["Excel"]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "publicar http:%{http_code}\n" -X PUT "$B/api/empresa/ofertas/$OID/publicar" -H "Authorization: Bearer $TE"
curl -s "$B/api/empresa/ofertas/$OID" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("estado:",d["estado"],"| publicado:",d.get("fecha_publicacion"))'

echo "== 14. bolsa pública SIN sesión: listar y detalle =="
curl -s -o /dev/null -w "GET /api/ofertas sin token http:%{http_code}\n" "$B/api/ofertas"
curl -s "$B/api/ofertas?q=Analista" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("públicas:",len(d),"| publicada visible:", any(o["puesto"]=="Analista contable" for o in d))'
curl -s "$B/api/ofertas/1" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("detalle público id1:",d["puesto"])'

echo "== 15. admin supervisa y cierra la oferta publicada =="
curl -s -o /dev/null -w "cerrar admin http:%{http_code}\n" -X PUT "$B/api/admin/ofertas/$OID/cerrar" -H "Authorization: Bearer $TA"
curl -s "$B/api/empresa/ofertas/$OID" -H "Authorization: Bearer $TE" | python3 -c 'import sys,json;print("estado final:",json.load(sys.stdin)["data"]["estado"])'
echo "== 16. postular sin sesión => 401 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/postulante/postulaciones" -H 'Content-Type: application/json' -d "{\"oferta_id\":1}"

echo "== 17. dashboard admin (campos nuevos para el gráfico) =="
curl -s "$B/api/admin/dashboard?desde=2026-01-01&hasta=2026-12-31" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("empresas:",d["empresas"]["total"],"| postulaciones:",sum(d["postulaciones"].values()),"| actividad_mensual:",len(d["actividad_mensual"]))'

echo "== 18. guard de rechazo: solicitud ya aprobada => 409 =="
curl -s -X POST "$B/api/admin/solicitudes-empresa/$SID/rechazar" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"motivo":"Prueba"}'
echo
echo "== 19. enlace regenerado por admin (obtenerEnlace) =="
LINK2=$(curl -s "$B/api/admin/solicitudes-empresa/$SID/enlace" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["link"])')
echo "link2=${LINK2:0:40}...  (el anterior quedó invalidado)"
curl -s -o /dev/null -w "enlace viejo tras regenerar http:%{http_code} (esperado 401)\n" "$B/api/activar-cuenta/$TOKEN"

echo
echo "FIN smoke desarrollo"
