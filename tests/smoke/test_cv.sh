#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# CV: fixtures válidos PDF/DOCX, descarga autorizada y casos negativos.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_cv.log
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %-48s %s\n' "$nombre" "$real"; else printf 'FAIL %-48s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
json_get() {
    python3 - "$1" "$2" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
if data.get('success') is not True or not isinstance(data.get('data'), dict):
    raise SystemExit('FAIL respuesta sin success/data')
actual = data['data']
for key in sys.argv[2].split('.'):
    if not isinstance(actual, dict) or key not in actual:
        raise SystemExit('FAIL falta la clave ' + key)
    actual = actual[key]
print(actual)
PY
}

TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)

paso "1. PDF válido: carga, consulta y descarga"
curl -s -o /tmp/opencode/cv_pdf_response.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv.pdf" > /tmp/opencode/cv_pdf_code
check_code "cargar PDF válido" 201 "$(cat /tmp/opencode/cv_pdf_code)"
json_get /tmp/opencode/cv_pdf_response.json 'version' >/dev/null
curl -s "$B/api/postulante/cv" -H "Authorization: Bearer $TP" > /tmp/opencode/cv_state.json
json_get /tmp/opencode/cv_state.json 'vigente.mime' | grep -qx 'application/pdf' && echo 'OK   CV PDF vigente con MIME application/pdf' || { echo 'FAIL CV PDF sin MIME esperado'; fallos=$((fallos + 1)); }
URL=$(curl -s "$B/api/postulante/cv/descargar" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data",{}).get("url"), "FAIL descarga sin URL";print(d["data"]["url"])')
KEY=${URL##*/}
curl -s -o /tmp/opencode/cv_pdf_download.pdf -w '%{http_code}' "$B/api/postulante/cv/archivo/$KEY" -H "Authorization: Bearer $TP" > /tmp/opencode/cv_pdf_download_code
check_code "descargar PDF" 200 "$(cat /tmp/opencode/cv_pdf_download_code)"
head -c 5 /tmp/opencode/cv_pdf_download.pdf | grep -q '%PDF' && echo 'OK   descarga PDF conserva firma' || { echo 'FAIL descarga PDF sin firma'; fallos=$((fallos + 1)); }

paso "2. DOCX válido: carga y descarga"
curl -s -o /tmp/opencode/cv_docx_response.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document;filename=cv.docx" > /tmp/opencode/cv_docx_code
check_code "cargar DOCX válido" 201 "$(cat /tmp/opencode/cv_docx_code)"
URL=$(curl -s "$B/api/postulante/cv/descargar" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data",{}).get("url"), "FAIL descarga sin URL";print(d["data"]["url"])')
KEY=${URL##*/}
curl -s -o /tmp/opencode/cv_docx_download.docx -w '%{http_code}' "$B/api/postulante/cv/archivo/$KEY" -H "Authorization: Bearer $TP" > /tmp/opencode/cv_docx_download_code
check_code "descargar DOCX" 200 "$(cat /tmp/opencode/cv_docx_download_code)"
head -c 2 /tmp/opencode/cv_docx_download.docx | grep -q 'PK' && echo 'OK   descarga DOCX conserva contenedor ZIP' || { echo 'FAIL descarga DOCX sin firma ZIP'; fallos=$((fallos + 1)); }

paso "3. nombres manipulados y descarga segura"
# Negativos: no deben crear registro ni consumir el límite mensual.
curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv.pdf.php" > /tmp/opencode/cv_ext_php_code
check_code "rechazar extensión PHP intermedia" 422 "$(cat /tmp/opencode/cv_ext_php_code)"
curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=cv.pdf." > /tmp/opencode/cv_punto_final_code
check_code "rechazar nombre terminado en punto" 422 "$(cat /tmp/opencode/cv_punto_final_code)"
curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=../../evil.pdf" > /tmp/opencode/cv_traversal_code
check_code "aceptar carga con nombre de ruta (se ignora)" 201 "$(cat /tmp/opencode/cv_traversal_code)"
URL=$(curl -s "$B/api/postulante/cv/descargar" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data",{}).get("url"), "FAIL descarga sin URL";print(d["data"]["url"])')
KEY=${URL##*/}
python3 - "$KEY" <<'PY'
import base64, re, sys
key = sys.argv[1]
raw = base64.urlsafe_b64decode(key + '=' * (-len(key) % 4)).decode('utf-8')
assert re.fullmatch(r'postulante-\d+/[0-9a-f]{16}\.pdf', raw), 'clave de objeto no canónica: ' + raw
print('OK   clave generada por el servidor:', raw)
PY
curl -s -D /tmp/opencode/cv_traversal_headers.txt -o /dev/null "$B/api/postulante/cv/archivo/$KEY" -H "Authorization: Bearer $TP"
grep -qi '^content-disposition: attachment; filename="evil.pdf"' /tmp/opencode/cv_traversal_headers.txt && echo 'OK   Content-Disposition reducido a evil.pdf' || { echo 'FAIL Content-Disposition con ruta'; fallos=$((fallos + 1)); }

curl -s -o /tmp/opencode/cv_accents_response.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=application/pdf;filename=José O'Connor.pdf" > /tmp/opencode/cv_accents_code
check_code "aceptar nombre con tildes y apóstrofe" 201 "$(cat /tmp/opencode/cv_accents_code)"
python3 - /tmp/opencode/cv_accents_response.json <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
nombre = d['data']['nombre_original']
assert nombre == "José O'Connor.pdf", 'nombre alterado: ' + nombre
print('OK   nombre original conservado:', nombre)
PY
URL=$(curl -s "$B/api/postulante/cv/descargar" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data",{}).get("url"), "FAIL descarga sin URL";print(d["data"]["url"])')
KEY=${URL##*/}
curl -s -D /tmp/opencode/cv_accents_headers.txt -o /dev/null "$B/api/postulante/cv/archivo/$KEY" -H "Authorization: Bearer $TP"
grep -qi "filename\*=UTF-8''Jos%C3%A9%20O%27Connor.pdf" /tmp/opencode/cv_accents_headers.txt && echo 'OK   Content-Disposition conserva el nombre UTF-8' || { echo 'FAIL Content-Disposition sin nombre UTF-8'; fallos=$((fallos + 1)); }

paso "4. claves de descarga inválidas"
for CLAVE in "$(printf '/etc/passwd' | base64 | tr '+/' '-_' | tr -d '=')" "$(printf 'postulante-1/../../etc/passwd' | base64 | tr '+/' '-_' | tr -d '=')" 'AAAA' 'bm8tZXMtYmFzZTY0'; do
  CODE=$(curl -s -o /tmp/opencode/cv_bad_key.json -w '%{http_code}' "$B/api/postulante/cv/archivo/$CLAVE" -H "Authorization: Bearer $TP")
  check_code "clave inválida no entrega archivo" 404 "$CODE"
  grep -Eq '/var/www|WRITEPATH|APPPATH' /tmp/opencode/cv_bad_key.json && { echo 'FAIL respuesta de clave inválida filtra rutas internas'; fallos=$((fallos + 1)); }
done

paso "5. casos negativos"
curl -s -o /tmp/opencode/cv_malformed.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv-malformado.pdf;type=application/pdf;filename=cv-malformado.pdf" > /tmp/opencode/cv_malformed_code
check_code "rechazar PDF con firma falsa" 422 "$(cat /tmp/opencode/cv_malformed_code)"
curl -s -o /tmp/opencode/cv_wrong_type.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=text/plain;filename=cv.txt" > /tmp/opencode/cv_wrong_type_code
check_code "rechazar extensión/MIME no permitidos" 422 "$(cat /tmp/opencode/cv_wrong_type_code)"
curl -s -o /dev/null -w '%{http_code}' "$B/api/postulante/cv" -H "Authorization: Bearer $TE" > /tmp/opencode/cv_unauth_code
check_code "empresa no accede CV de postulante" 403 "$(cat /tmp/opencode/cv_unauth_code)"

echo
echo 'FIN test_cv'
[ "$fallos" -eq 0 ] || exit 1
