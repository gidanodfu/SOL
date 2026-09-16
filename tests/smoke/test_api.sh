#!/usr/bin/env bash
# Prueba de humo de la API (iteración 1). Requiere MySQL migrado y seed.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark.log

env 'storage.driver=local' php spark serve > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }

js() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(d)' ; }

paso "1. login admin"
R=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}')
echo "$R" | js | head -c 400; echo
AT=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')

paso "2. me (admin)"
curl -s "$B/api/auth/me" -H "Authorization: Bearer $AT" | js | head -c 300; echo

paso "3. dashboard admin"
curl -s "$B/api/admin/dashboard?desde=2026-01-01&hasta=2026-12-31" -H "Authorization: Bearer $AT" | js | head -c 600; echo

paso "4. listar usuarios"
curl -s "$B/api/admin/usuarios" -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("total:",d["total"]);[print(" -",u["username"],u["rol"],u["estado"]) for u in d["data"]]'

paso "5. listar empresas"
curl -s "$B/api/admin/empresas" -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("total:",d["total"]);[print(" -",e["ruc"],e["razon_social"],e["estado"]) for e in d["data"]]'

paso "6. crear empresa (RUC 20609999999, sin evaluacion => inactiva)"
C=$(curl -s -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"ruc":"20609999999","razon_social":"Comercial Prueba SAC","email":"p@prueba.pe","password":"Prueba123!"}')
echo "$C" | js | head -c 300; echo

paso "6b. login empresa recién creada (debe fallar: inactiva, RN-10)"
curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20609999999","password":"Prueba123!"}' | js | head -c 300; echo

paso "6c. duplicado RUC => 409"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"ruc":"20609999999","razon_social":"Otra SAC","password":"Prueba123!"}'

paso "7. login empresa seed"
RE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}')
AT_E=$(echo "$RE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
curl -s "$B/api/empresa/perfil" -H "Authorization: Bearer $AT_E" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["ruc"],d["razon_social"],d["estado"])'
curl -s "$B/api/empresa/dashboard" -H "Authorization: Bearer $AT_E" | js | head -c 500; echo

paso "8. empresa NO puede ver admin/usuarios (403)"
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/admin/usuarios" -H "Authorization: Bearer $AT_E"

paso "9. login postulante seed"
RP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}')
AT_P=$(echo "$RP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
curl -s "$B/api/postulante/perfil" -H "Authorization: Bearer $AT_P" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["dni"], d["nombres"], "cv:", d["cv"])'
curl -s "$B/api/postulante/dashboard" -H "Authorization: Bearer $AT_P" | js | head -c 300; echo

paso "10. registro nuevo postulante DNI 87654321"
curl -s -X POST "$B/api/registro/postulante" -H 'Content-Type: application/json' -d '{"dni":"87654321","nombres":"Luis","apellidos":"Perez Diaz","email":"luis@mail.com","password":"Clave12345!","password2":"Clave12345!"}' | js | head -c 300; echo

paso "10b. login nuevo postulante"
curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"87654321","password":"Clave12345!"}' | js | head -c 200; echo

paso "11. subir CV (local) + descargar"
head -c 5000 /dev/urandom > /tmp/opencode/cv.pdf
CU=$(curl -s -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $AT_P" -F "cv=@/tmp/opencode/cv.pdf;type=application/pdf;filename=mi-cv.pdf")
echo "$CU" | js | head -c 300; echo
D=$(curl -s "$B/api/postulante/cv/descargar" -H "Authorization: Bearer $AT_P")
echo "$D" | js | head -c 300; echo
URL=$(echo "$D" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["url"])')
CLAVE=$(echo "$URL" | sed 's#.*/cv/archivo/##')
curl -s -o /tmp/opencode/descarga.pdf -w "archivo http:%{http_code} bytes:%{size_download}\n" "$B/api/postulante/cv/archivo/$CLAVE" -H "Authorization: Bearer $AT_P"
# empresa NO debe poder descargar CV ajeno
curl -s -o /dev/null -w "empresa descarga cv ajeno http:%{http_code}\n" "$B/api/postulante/cv/archivo/$CLAVE" -H "Authorization: Bearer $AT_E"

paso "12. refresh token"
RT=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["refresh_token"])')
curl -s -X POST "$B/api/auth/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT\"}" | js | head -c 200; echo

paso "13. crear usuario municipal y desactivar"
curl -s -o /dev/null -w "crear admin http:%{http_code}\n" -X POST "$B/api/admin/usuarios" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"username":"municipal1","nombres":"Rosa","apellidos":"Flores","password":"Segura123!"}'
curl -s -o /dev/null -w "login municipal http:%{http_code}\n" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"municipal1","password":"Segura123!"}'
ID=$(curl -s "$B/api/admin/usuarios?q=municipal1" -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["data"][0]["id"])')
curl -s -o /dev/null -w "desactivar http:%{http_code}\n" -X PUT "$B/api/admin/usuarios/$ID/estado" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"estado":"inactivo"}'
curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"municipal1","password":"Segura123!"}' | js | head -c 200; echo

paso "13b. admin NO puede desactivarse a sí mismo"
ADMIN_ID=$(curl -s "$B/api/auth/me" -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "autodesactivar http:%{http_code} (esperado 403)\n" -X PUT "$B/api/admin/usuarios/$ADMIN_ID/estado" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"estado":"inactivo"}'
curl -s -o /dev/null -w "admin sigue operativo http:%{http_code} (esperado 200)\n" "$B/api/auth/me" -H "Authorization: Bearer $AT"

paso "13c. reactivar municipal1 => login OK"
curl -s -o /dev/null -w "reactivar http:%{http_code}\n" -X PUT "$B/api/admin/usuarios/$ID/estado" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"estado":"activo"}'
curl -s -o /dev/null -w "login municipal reactivado http:%{http_code}\n" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"municipal1","password":"Segura123!"}'

echo
echo "FIN pruebas"
