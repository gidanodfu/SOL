#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Reporte Excel de empresa: autenticación, aislamiento por empresa, filtros y columnas.
# Requiere MySQL migrado con SystemSeeder + DatosPruebaSeeder.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_reporte.log
XLSX=/tmp/opencode/reporte_empresa.xlsx

env 'storage.driver=local' php spark serve > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }
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

TA_EMP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)
TA_ADM=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TA_POS=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

paso "1. empresa autenticada descarga su reporte (200 + XLSX)"
curl -s -D /tmp/opencode/rep_headers.txt -o "$XLSX" -w "http:%{http_code}\n" "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TA_EMP"
grep -i '^content-type:' /tmp/opencode/rep_headers.txt
grep -i '^content-disposition:' /tmp/opencode/rep_headers.txt
echo "bytes: $(wc -c < "$XLSX")"

paso "2. sin token => 401"
curl -s -o /dev/null -w "http:%{http_code} (401)\n" "$B/api/empresa/reportes/excel"

paso "3. postulante => 403"
curl -s -o /dev/null -w "http:%{http_code} (403)\n" "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TA_POS"

paso "4. admin => 403 (es endpoint de empresa)"
curl -s -o /dev/null -w "http:%{http_code} (403)\n" "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TA_ADM"

paso "5. columnas esperadas en el XLSX"
TEXTO=$(xlsx_texto "$XLSX")
for col in Fecha Oferta Postulante DNI Estado Situación Contratado Cargo Modalidad Puesto Vacantes Ubicación Resumen; do
  echo "$TEXTO" | grep -q "$col" && echo "OK  $col" || echo "FALTA  $col"
done

paso "6. registros del periodo (postulante del seeder 12345678)"
curl -s -o /tmp/opencode/rep_periodo.xlsx "$B/api/empresa/reportes/excel?desde=2000-01-01&hasta=2099-01-01" -H "Authorization: Bearer $TA_EMP"
xlsx_texto /tmp/opencode/rep_periodo.xlsx | grep -q "12345678" && echo "OK  incluye postulaciones del periodo" || echo "FALTA  postulaciones del periodo"

paso "7. rango futuro => sin registros (filtro hacia atrás)"
curl -s -o /tmp/opencode/rep_futuro.xlsx "$B/api/empresa/reportes/excel?desde=2099-01-01" -H "Authorization: Bearer $TA_EMP"
xlsx_texto /tmp/opencode/rep_futuro.xlsx | grep -q "12345678" && echo "FALTA  el filtro no excluyó" || echo "OK  excluye registros fuera del rango"

paso "8. desde > hasta => 422"
curl -s -o /dev/null -w "http:%{http_code} (422)\n" "$B/api/empresa/reportes/excel?desde=2026-12-31&hasta=2026-01-01" -H "Authorization: Bearer $TA_EMP"

paso "9. formato de fecha inválido => 422"
curl -s -o /dev/null -w "http:%{http_code} (422)\n" "$B/api/empresa/reportes/excel?desde=01/01/2026" -H "Authorization: Bearer $TA_EMP"

paso "10. aislamiento: empresa A no ve datos de empresa B"
RUC_B="2069$(date +%s | cut -c4-10)"
NOMBRE_B="Servicios Beta $RUC_B SAC"
curl -s -o /dev/null -w "crear empresa B http:%{http_code}\n" -X POST "$B/api/admin/empresas" -H "Authorization: Bearer $TA_ADM" -H 'Content-Type: application/json' \
  -d "{\"ruc\":\"$RUC_B\",\"razon_social\":\"$NOMBRE_B\",\"email\":\"beta$RUC_B@prueba.pe\",\"telefono\":\"987654321\",\"password\":\"Beta12345!\",\"evaluacion_presencial\":true}"
TB_EMP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$RUC_B\",\"password\":\"Beta12345!\"}" | tok)

curl -s -o /tmp/opencode/rep_A.xlsx "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TA_EMP"
curl -s -o /tmp/opencode/rep_B.xlsx "$B/api/empresa/reportes/excel" -H "Authorization: Bearer $TB_EMP"
A_TEXTO=$(xlsx_texto /tmp/opencode/rep_A.xlsx)
B_TEXTO=$(xlsx_texto /tmp/opencode/rep_B.xlsx)
echo "$A_TEXTO" | grep -q "$RUC_B" && echo "FALTA  A incluye el RUC de B" || echo "OK  A no incluye el RUC de B"
echo "$B_TEXTO" | grep -q "$RUC_B" && echo "OK  B incluye su propio RUC" || echo "FALTA  B no incluye su RUC"
echo "$A_TEXTO" | grep -q "20601234567" && echo "OK  A incluye su propio RUC" || echo "FALTA  A no incluye su RUC"

paso "11. manipular empresa_id no cambia el alcance"
curl -s -o /tmp/opencode/rep_A_param.xlsx "$B/api/empresa/reportes/excel?empresa_id=$(curl -s "$B/api/admin/empresas?q=$RUC_B" -H "Authorization: Bearer $TA_ADM" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["data"][0]["id"])')" -H "Authorization: Bearer $TA_EMP"
A_PARAM=$(xlsx_texto /tmp/opencode/rep_A_param.xlsx)
echo "$A_PARAM" | grep -q "$RUC_B" && echo "FALTA  el parámetro empresa_id filtró a otra empresa" || echo "OK  empresa_id ignorado; sigue siendo A"

echo
echo "FIN reporte empresa"
