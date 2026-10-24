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

paso "3. casos negativos"
curl -s -o /tmp/opencode/cv_malformed.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv-malformado.pdf;type=application/pdf;filename=cv-malformado.pdf" > /tmp/opencode/cv_malformed_code
check_code "rechazar PDF con firma falsa" 422 "$(cat /tmp/opencode/cv_malformed_code)"
curl -s -o /tmp/opencode/cv_wrong_type.json -w '%{http_code}' -X POST "$B/api/postulante/cv" -H "Authorization: Bearer $TP" -F "cv=@/var/www/sol/tests/fixtures/cv.pdf;type=text/plain;filename=cv.txt" > /tmp/opencode/cv_wrong_type_code
check_code "rechazar extensión/MIME no permitidos" 422 "$(cat /tmp/opencode/cv_wrong_type_code)"
curl -s -o /dev/null -w '%{http_code}' "$B/api/postulante/cv" -H "Authorization: Bearer $TE" > /tmp/opencode/cv_unauth_code
check_code "empresa no accede CV de postulante" 403 "$(cat /tmp/opencode/cv_unauth_code)"

echo
echo 'FIN test_cv'
[ "$fallos" -eq 0 ] || exit 1
