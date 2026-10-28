#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Reportes PDF administrativo y de empresa: autenticación, aislamiento,
# filtros, contenido institucional, paginación y no regresión de Excel.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_reporte_pdf.log
ADMIN_PDF=/tmp/opencode/reporte_admin.pdf
ADMIN_RANGO_PDF=/tmp/opencode/reporte_admin_rango.pdf
ADMIN_VACIO_PDF=/tmp/opencode/reporte_admin_vacio.pdf
EMPRESA_PDF=/tmp/opencode/reporte_empresa.pdf
EMPRESA_VACIO_PDF=/tmp/opencode/reporte_empresa_vacio.pdf
EMPRESA_B_PDF=/tmp/opencode/reporte_empresa_b.pdf
ADMIN_XLSX=/tmp/opencode/reporte_admin_pdf.xlsx
EMPRESA_XLSX=/tmp/opencode/reporte_empresa_pdf.xlsx
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }
paso() { printf '\n== %s ==\n' "$1"; }

check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then ok "$nombre ($real)"; else fail "$nombre ($real, esperado $esperado)"; fi
}

tok() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "login sin access_token";print(d["data"]["access_token"])'
}

xlsx_texto() {
    python3 - "$1" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    texto = ''
    for nombre in z.namelist():
        if nombre.startswith('xl/') and nombre.endswith('.xml'):
            texto += z.read(nombre).decode('utf-8', 'ignore')
print(texto)
PY
}

pdf_texto() { pdftotext -layout "$1" - 2>/dev/null; }
pdf_paginas() { pdfinfo "$1" 2>/dev/null | awk '/^Pages:/ {print $2; exit}'; }
pdf_paginas_con_logo() { pdfimages -list "$1" 2>/dev/null | awk 'NR>2 {print $1}' | sort -n | uniq; }

TA_ADM=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TA_EMP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA_POS=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

paso "1. PDF administrativo sin filtros"
CODE=$(curl -sS -D /tmp/opencode/pdf_admin_headers.txt -o "$ADMIN_PDF" -w '%{http_code}' "$B/api/admin/reportes/pdf" -H "Authorization: Bearer $TA_ADM")
check_code 'administrativo descarga PDF' 200 "$CODE"
grep -qi '^content-type: application/pdf' /tmp/opencode/pdf_admin_headers.txt && ok 'MIME application/pdf' || fail 'MIME PDF incorrecto'
grep -qi '^content-disposition: attachment; filename="reporte-empleo.pdf"' /tmp/opencode/pdf_admin_headers.txt && ok 'nombre de archivo sin filtros' || fail 'nombre de archivo sin filtros incorrecto'
grep -qi '^cache-control: private, no-store' /tmp/opencode/pdf_admin_headers.txt && ok 'Cache-Control privado' || fail 'Cache-Control incorrecto'
grep -qi '^x-content-type-options: nosniff' /tmp/opencode/pdf_admin_headers.txt && ok 'nosniff' || fail 'falta nosniff'
[ "$(head -c 5 "$ADMIN_PDF")" = "%PDF-" ] && ok 'firma %PDF-' || fail 'archivo sin firma PDF'
[ "$(wc -c < "$ADMIN_PDF")" -gt 1000 ] && ok 'PDF no vacío' || fail 'PDF vacío'
PAGINAS=$(pdf_paginas "$ADMIN_PDF")
[ "${PAGINAS:-0}" -ge 5 ] && ok "páginas >= 5 ($PAGINAS)" || fail "páginas insuficientes ($PAGINAS)"
pdf_texto "$ADMIN_PDF" | grep -Fq "Página 1 de $PAGINAS" && ok 'numeración inicial del pie' || fail 'numeración inicial incorrecta'
pdf_texto "$ADMIN_PDF" | grep -Fq "Página $PAGINAS de $PAGINAS" && ok 'numeración final del pie' || fail 'numeración final incorrecta'
TEXTO=$(pdf_texto "$ADMIN_PDF")
for seccion in "Municipalidad Distrital de José Leonardo Ortiz" "Sistema de Empleo MDJLO" "Reporte de gestión de empleo" "Resumen de gestión" "Actividad de postulaciones" "Ofertas por estado" "Postulaciones por estado" "Detalle de contrataciones"; do
    echo "$TEXTO" | grep -Fq "$seccion" && ok "sección: $seccion" || fail "falta sección: $seccion"
done
PAGINAS_LOGO=$(pdf_paginas_con_logo "$ADMIN_PDF" | tr '\n' ' ')
[ -n "$PAGINAS_LOGO" ] && ok "logo embebido en páginas: $PAGINAS_LOGO" || fail 'no se detectó imagen del logo'
for p in $(seq 1 "${PAGINAS:-0}"); do
    pdftotext -f "$p" -l "$p" "$ADMIN_PDF" - 2>/dev/null | grep -Fq 'Municipalidad Distrital de José Leonardo Ortiz' \
        && ok "encabezado institucional en página $p" || fail "falta encabezado en página $p"
done

paso "2. PDF administrativo con rango aplicado"
CODE=$(curl -sS -D /tmp/opencode/pdf_admin_rango_headers.txt -o "$ADMIN_RANGO_PDF" -w '%{http_code}' "$B/api/admin/reportes/pdf?desde=2026-01-01&hasta=2026-12-31" -H "Authorization: Bearer $TA_ADM")
check_code 'administrativo con rango' 200 "$CODE"
grep -qi 'filename="reporte-empleo-2026-01-01_2026-12-31.pdf"' /tmp/opencode/pdf_admin_rango_headers.txt && ok 'periodo incluido en el nombre' || fail 'nombre sin periodo'
pdf_texto "$ADMIN_RANGO_PDF" | grep -Fq 'Del 01/01/2026 al 31/12/2026' && ok 'periodo visible en el documento' || fail 'periodo no visible'

paso "3. PDF administrativo de un periodo sin registros"
CODE=$(curl -sS -o "$ADMIN_VACIO_PDF" -w '%{http_code}' "$B/api/admin/reportes/pdf?desde=2099-01-01&hasta=2099-12-31" -H "Authorization: Bearer $TA_ADM")
check_code 'administrativo sin registros' 200 "$CODE"
pdf_texto "$ADMIN_VACIO_PDF" | grep -Fq 'Sin registros para el periodo seleccionado.' && ok 'estado vacío explícito' || fail 'no muestra estado vacío'

paso "4. validación y autorización"
check_code 'rango invertido => 422' 422 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/pdf?desde=2026-12-31&hasta=2026-01-01" -H "Authorization: Bearer $TA_ADM")"
check_code 'fecha inválida => 422' 422 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/pdf?desde=01/01/2026" -H "Authorization: Bearer $TA_ADM")"
check_code 'sin token => 401' 401 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/pdf")"
check_code 'postulante en admin => 403' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/pdf" -H "Authorization: Bearer $TA_POS")"
check_code 'empresa en admin => 403' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/admin/reportes/pdf" -H "Authorization: Bearer $TA_EMP")"
check_code 'admin en empresa => 403' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/empresa/reportes/pdf" -H "Authorization: Bearer $TA_ADM")"
check_code 'postulante en empresa => 403' 403 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/empresa/reportes/pdf" -H "Authorization: Bearer $TA_POS")"

paso "5. PDF de la empresa autenticada"
PERFIL_A=$(curl -s "$B/api/empresa/perfil" -H "Authorization: Bearer $TA_EMP")
NOMBRE_A=$(echo "$PERFIL_A" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;print(d["data"]["razon_social"])')
RUC_A=$(echo "$PERFIL_A" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;print(d["data"]["ruc"])')
CODE=$(curl -sS -D /tmp/opencode/pdf_empresa_headers.txt -o "$EMPRESA_PDF" -w '%{http_code}' "$B/api/empresa/reportes/pdf" -H "Authorization: Bearer $TA_EMP")
check_code 'empresa descarga PDF' 200 "$CODE"
grep -qi '^content-type: application/pdf' /tmp/opencode/pdf_empresa_headers.txt && ok 'MIME PDF empresa' || fail 'MIME PDF empresa incorrecto'
grep -qi '^content-disposition: attachment; filename="reporte-empresa-' /tmp/opencode/pdf_empresa_headers.txt && ok 'nombre PDF empresa' || fail 'nombre PDF empresa incorrecto'
TEXTO_EMP=$(pdf_texto "$EMPRESA_PDF")
echo "$TEXTO_EMP" | grep -Fq "$NOMBRE_A" && ok 'identidad empresarial A presente' || fail 'falta identidad A'
echo "$TEXTO_EMP" | grep -Fq "$RUC_A" && ok 'RUC A presente' || fail 'falta RUC A'
for seccion in "Reporte de actividad empresarial" "Resumen de actividad" "Ofertas" "Postulaciones" "Contrataciones"; do
    echo "$TEXTO_EMP" | grep -Fq "$seccion" && ok "sección empresa: $seccion" || fail "falta sección empresa: $seccion"
done
PAGINAS_EMP=$(pdf_paginas "$EMPRESA_PDF")
[ "${PAGINAS_EMP:-0}" -ge 4 ] && ok "páginas empresa >= 4 ($PAGINAS_EMP)" || fail "páginas empresa insuficientes ($PAGINAS_EMP)"
pdf_texto "$EMPRESA_PDF" | grep -Fq "Página 1 de $PAGINAS_EMP" && ok 'numeración inicial empresa' || fail 'numeración inicial empresa incorrecta'
pdf_texto "$EMPRESA_PDF" | grep -Fq "Página $PAGINAS_EMP de $PAGINAS_EMP" && ok 'numeración final empresa' || fail 'numeración final empresa incorrecta'
for p in $(seq 1 "${PAGINAS_EMP:-0}"); do
    pdftotext -f "$p" -l "$p" "$EMPRESA_PDF" - 2>/dev/null | grep -Fq 'Municipalidad Distrital de José Leonardo Ortiz' \
        && ok "encabezado empresa en página $p" || fail "falta encabezado empresa en página $p"
done

paso "6. PDF de empresa con periodo sin registros"
CODE=$(curl -sS -o "$EMPRESA_VACIO_PDF" -w '%{http_code}' "$B/api/empresa/reportes/pdf?desde=2099-01-01&hasta=2099-12-31" -H "Authorization: Bearer $TA_EMP")
check_code 'empresa sin registros' 200 "$CODE"
pdf_texto "$EMPRESA_VACIO_PDF" | grep -Fq 'Sin registros para el periodo seleccionado.' && ok 'estado vacío empresa' || fail 'falta estado vacío empresa'

paso "7. aislamiento: empresa A no exporta datos de empresa B"
RUC_B="206$(date +%s | cut -c3-10)"
NOMBRE_B="Servicios Beta PDF SAC"
CREATE_B=$(curl -s -o /tmp/opencode/pdf_crear_b.json -w '%{http_code}' -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' \
  -d "{\"ruc\":\"$RUC_B\",\"razon_social\":\"$NOMBRE_B\",\"email\":\"beta$RUC_B@prueba.pe\",\"telefono\":\"999000123\",\"password\":\"Beta12345!\",\"evaluacion_presencial\":true}")
if [ "$CREATE_B" = "201" ]; then
    ok 'empresa B creada para la prueba'
else
    fail "empresa B no se pudo crear ($CREATE_B)"
    cat /tmp/opencode/pdf_crear_b.json
    exit 1
fi
ID_B=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/pdf_crear_b.json"))["data"]["id"])')
TB_EMP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$RUC_B\",\"password\":\"Beta12345!\"}" | tok)

curl -sS -o /tmp/opencode/pdf_A_aislamiento.pdf "$B/api/empresa/reportes/pdf?empresa_id=$ID_B" -H "Authorization: Bearer $TA_EMP"
curl -sS -o "$EMPRESA_B_PDF" "$B/api/empresa/reportes/pdf" -H "Authorization: Bearer $TB_EMP"
TEXTO_A=$(pdf_texto /tmp/opencode/pdf_A_aislamiento.pdf)
TEXTO_B=$(pdf_texto "$EMPRESA_B_PDF")
echo "$TEXTO_A" | grep -Fq "$NOMBRE_B" && fail 'A incluyó el nombre de B' || ok 'A no incluye el nombre de B'
echo "$TEXTO_A" | grep -Fq "$RUC_B" && fail 'A incluyó el RUC de B' || ok 'A no incluye el RUC de B'
echo "$TEXTO_B" | grep -Fq "$NOMBRE_B" && ok 'B incluye su propio nombre' || fail 'B no incluye su nombre'
echo "$TEXTO_B" | grep -Fq "$RUC_B" && ok 'B incluye su propio RUC' || fail 'B no incluye su RUC'
echo "$TEXTO_B" | grep -Fq "$RUC_A" && fail 'B incluyó el RUC de A' || ok 'B no incluye datos de A'

paso "8. límites temporales y consistencia PDF/Excel"
HOY=$(php -r 'date_default_timezone_set("America/Lima"); echo date("Y-m-d");')
AYER=$(php -r 'date_default_timezone_set("America/Lima"); echo date("Y-m-d", strtotime("-1 day"));')
HOY="$HOY" php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("DELETE FROM ofertas WHERE puesto = \"LIMITE PDF HOY\"");
$empresaId = (int) $pdo->query("SELECT id FROM empresas WHERE ruc = \"20601234567\"")->fetchColumn();
$hoy = getenv("HOY");
$stmt = $pdo->prepare("INSERT INTO ofertas (empresa_id, puesto, descripcion, funciones, vacantes, estado, fecha_publicacion, fecha_cierre, created_at, updated_at) VALUES (?, \"LIMITE PDF HOY\", \"Fixture límite\", \"Fixture límite\", 1, \"borrador\", ?, ?, ?, ?)");
$stmt->execute([$empresaId, $hoy, $hoy, $hoy . " 00:00:00", $hoy . " 00:00:00"]);
echo "fixture de límite insertado\n";
' || fail 'insertar fixture de límite temporal'

PDF_HOY=/tmp/opencode/pdf_limite_hoy.pdf
PDF_AYER=/tmp/opencode/pdf_limite_ayer.pdf
XLSX_HOY=/tmp/opencode/xlsx_limite_hoy.xlsx
XLSX_AYER=/tmp/opencode/xlsx_limite_ayer.xlsx
check_code 'PDF solo fecha inicial' 200 "$(curl -sS -D /tmp/opencode/pdf_solo_desde_headers.txt -o /tmp/opencode/pdf_solo_desde.pdf -w '%{http_code}' "$B/api/empresa/reportes/pdf?desde=$HOY" -H "Authorization: Bearer $TA_EMP")"
check_code 'PDF solo fecha final' 200 "$(curl -sS -D /tmp/opencode/pdf_solo_hasta_headers.txt -o /tmp/opencode/pdf_solo_hasta.pdf -w '%{http_code}' "$B/api/empresa/reportes/pdf?hasta=$HOY" -H "Authorization: Bearer $TA_EMP")"
grep -qi "filename=\"reporte-empresa-desde-$HOY.pdf\"" /tmp/opencode/pdf_solo_desde_headers.txt && ok 'nombre con fecha inicial' || fail 'nombre sin fecha inicial'
grep -qi "filename=\"reporte-empresa-hasta-$HOY.pdf\"" /tmp/opencode/pdf_solo_hasta_headers.txt && ok 'nombre con fecha final' || fail 'nombre sin fecha final'
check_code 'PDF rango del día' 200 "$(curl -sS -o "$PDF_HOY" -w '%{http_code}' "$B/api/empresa/reportes/pdf?desde=$HOY&hasta=$HOY" -H "Authorization: Bearer $TA_EMP")"
check_code 'PDF día anterior' 200 "$(curl -sS -o "$PDF_AYER" -w '%{http_code}' "$B/api/empresa/reportes/pdf?desde=$AYER&hasta=$AYER" -H "Authorization: Bearer $TA_EMP")"
check_code 'Excel rango del día' 200 "$(curl -sS -o "$XLSX_HOY" -w '%{http_code}' "$B/api/empresa/reportes/excel?desde=$HOY&hasta=$HOY" -H "Authorization: Bearer $TA_EMP")"
check_code 'Excel día anterior' 200 "$(curl -sS -o "$XLSX_AYER" -w '%{http_code}' "$B/api/empresa/reportes/excel?desde=$AYER&hasta=$AYER" -H "Authorization: Bearer $TA_EMP")"

pdf_texto "$PDF_HOY" | grep -Fq 'LIMITE PDF HOY' && ok 'PDF incluye el límite inicial/final del día' || fail 'PDF no incluye el límite del día'
pdf_texto "$PDF_AYER" | grep -Fq 'LIMITE PDF HOY' && fail 'PDF incluye un registro fuera del rango' || ok 'PDF excluye el registro fuera del rango'
pdf_texto /tmp/opencode/pdf_solo_desde.pdf | grep -Fq 'LIMITE PDF HOY' && ok 'PDF con solo fecha inicial' || fail 'PDF con solo fecha inicial no incluye el límite'
pdf_texto /tmp/opencode/pdf_solo_hasta.pdf | grep -Fq 'LIMITE PDF HOY' && ok 'PDF con solo fecha final' || fail 'PDF con solo fecha final no incluye el límite'
XLSX_HOY_TEXTO=$(xlsx_texto "$XLSX_HOY")
XLSX_AYER_TEXTO=$(xlsx_texto "$XLSX_AYER")
echo "$XLSX_HOY_TEXTO" | grep -Fq 'LIMITE PDF HOY' && ok 'Excel incluye el mismo límite' || fail 'Excel no incluye el límite que sí ve el PDF'
echo "$XLSX_AYER_TEXTO" | grep -Fq 'LIMITE PDF HOY' && fail 'Excel incluye un registro que el PDF excluye' || ok 'Excel y PDF coinciden al excluir el límite'

paso "9. no regresión de Excel"
CODE=$(curl -sS -o "$ADMIN_XLSX" -w '%{http_code}' "$B/api/admin/reportes/excel" -H "Authorization: Bearer $TA_ADM")
check_code 'Excel administrativo sigue disponible' 200 "$CODE"
[ "$(head -c 2 "$ADMIN_XLSX")" = "PK" ] && ok 'XLSX administrativo válido' || fail 'XLSX administrativo inválido'
CODE=$(curl -sS -o "$EMPRESA_XLSX" -w '%{http_code}' "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TA_EMP")
check_code 'Excel de empresa sigue disponible' 200 "$CODE"
[ "$(head -c 2 "$EMPRESA_XLSX")" = "PK" ] && ok 'XLSX de empresa válido' || fail 'XLSX de empresa inválido'

printf '\nFIN reportes PDF\n'
[ "$fallos" -eq 0 ] || exit 1
