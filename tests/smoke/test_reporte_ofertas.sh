#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Reporte Excel: las siete categorías de oferta, el estado efectivo vencida y
# los totales deben coincidir con los indicadores del dashboard. Se ejecuta
# dentro del contenedor de pruebas con un esquema MySQL aislado.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_reporte_estados.log
ADMIN_XLSX=/tmp/opencode/reporte_admin_estados.xlsx
EMPRESA_XLSX=/tmp/opencode/reporte_empresa_estados.xlsx
fallos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }

check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then ok "$nombre ($real)"; else fail "$nombre ($real, esperado $esperado)"; fi
}

tok() {
    python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "login sin access_token";print(d["data"]["access_token"])'
}

leer_hoja() {
    php -r '
    require "vendor/autoload.php";
    $libro = \PhpOffice\PhpSpreadsheet\IOFactory::load($argv[1]);
    $hoja = $libro->getSheetByName($argv[2]);
    if ($hoja === null) {
        fwrite(STDERR, "hoja no encontrada: " . $argv[2] . "\n");
        exit(1);
    }
    foreach ($hoja->toArray() as $fila) {
        echo implode("\t", array_map(static fn ($valor) => (string) ($valor ?? ""), $fila)), "\n";
    }
    ' "$1" "$2"
}

hojas() {
    php -r '
    require "vendor/autoload.php";
    $libro = \PhpOffice\PhpSpreadsheet\IOFactory::load($argv[1]);
    echo implode("\t", $libro->getSheetNames()), "\n";
    ' "$1"
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TE=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"20601234567","password":"Empresa123!"}' | tok)

paso() { printf '\n== %s ==\n' "$1"; }

paso "1. línea base de ofertas en el dashboard"
BASE=$(curl -s "$B/api/admin/dashboard" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;print(json.dumps(d["data"]["ofertas"],ensure_ascii=False,separators=(",",":")))')
printf 'base: %s\n' "$BASE"

paso "2. fixtures: una oferta por estado y dos publicadas (vigente y sin cierre)"
HOY=$(php -r 'echo date("Y-m-d");')
AYER=$(php -r 'echo date("Y-m-d", strtotime("-1 day"));')
FUTURO=$(php -r 'echo date("Y-m-d", strtotime("+30 days"));')
HOY="$HOY" AYER="$AYER" FUTURO="$FUTURO" php -r '
$pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USER"), getenv("DB_PASSWORD"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("DELETE FROM ofertas WHERE puesto LIKE \"Reporte estado %\" OR puesto IN (\"Reporte publicada vencida\", \"Reporte publicada sin cierre\")");
$empresaId = (int) $pdo->query("SELECT id FROM empresas WHERE ruc = \"20601234567\"")->fetchColumn();
$fixtures = [
    ["Reporte estado borrador", "borrador", getenv("HOY"), null],
    ["Reporte estado pendiente", "pendiente", getenv("HOY"), getenv("FUTURO")],
    ["Reporte estado publicada", "publicada", getenv("HOY"), getenv("FUTURO")],
    ["Reporte publicada vencida", "publicada", getenv("HOY"), getenv("AYER")],
    ["Reporte publicada sin cierre", "publicada", getenv("HOY"), null],
    ["Reporte estado cerrada", "cerrada", getenv("HOY"), getenv("AYER")],
    ["Reporte estado observada", "observada", getenv("HOY"), getenv("FUTURO")],
    ["Reporte estado rechazada", "rechazada", getenv("HOY"), getenv("FUTURO")],
];
$stmt = $pdo->prepare("INSERT INTO ofertas (empresa_id, puesto, descripcion, funciones, vacantes, estado, fecha_publicacion, fecha_cierre, created_at, updated_at) VALUES (?, ?, \"Fixtures de reporte\", \"Fixtures de reporte\", 1, ?, ?, ?, NOW(), NOW())");
foreach ($fixtures as $f) {
    $stmt->execute([$empresaId, $f[0], $f[1], $f[2], $f[3]]);
}
echo "fixtures insertados: " . count($fixtures) . "\n";
' || fail 'insertar fixtures de ofertas'

paso "3. el dashboard refleja cada fixture en su estado efectivo"
EXPECTED=$(curl -s "$B/api/admin/dashboard" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True;print(json.dumps(d["data"]["ofertas"],ensure_ascii=False,separators=(",",":")))')
if BASE="$BASE" EXPECTED="$EXPECTED" python3 - <<'PY'
import json, os
base = json.loads(os.environ["BASE"])
expected = json.loads(os.environ["EXPECTED"])
deltas = {
    "borrador": 1,
    "pendiente": 1,
    "publicada": 2,
    "vencida": 1,
    "cerrada": 1,
    "observada": 1,
    "rechazada": 1,
}
for estado, delta in deltas.items():
    assert expected[estado] - base[estado] == delta, (estado, base[estado], expected[estado])
print("deltas correctos:", deltas)
PY
then ok 'dashboard clasifica los ocho fixtures sin duplicar vencida como publicada'; else fail 'dashboard no clasificó los fixtures como se esperaba'; fi

paso "4. descarga del reporte administrativo"
check_code 'administrativo descarga XLSX' 200 "$(curl -s -o "$ADMIN_XLSX" -w '%{http_code}' "$B/api/admin/reportes/excel" -H "Authorization: Bearer $TA")"
ADMIN_SHEETS=$(hojas "$ADMIN_XLSX")
if [ "$ADMIN_SHEETS" = "Resumen	Actividad mensual	Ofertas por estado	Postulaciones por estado	Contrataciones" ]; then
    ok 'se conservan las hojas y su orden'
else
    fail "hojas administrativas inesperadas: $ADMIN_SHEETS"
fi

paso "5. Ofertas por estado: siete etiquetas, conteos y total"
leer_hoja "$ADMIN_XLSX" "Ofertas por estado" > /tmp/opencode/admin_ofertas_estado.tsv
if EXPECTED="$EXPECTED" python3 - /tmp/opencode/admin_ofertas_estado.tsv <<'PY'
import json, os, sys
filas = [line.rstrip("\n").split("\t") for line in open(sys.argv[1], encoding="utf-8")]
expected = json.loads(os.environ["EXPECTED"])
etiquetas = {
    "borrador": "Borrador",
    "pendiente": "Pendiente de revisión",
    "publicada": "Publicada",
    "vencida": "Vencida",
    "cerrada": "Cerrada",
    "observada": "Observada",
    "rechazada": "Rechazada",
}
assert filas[0] == ["Estado", "Cantidad"], filas[0]
valores = {}
for fila in filas[1:]:
    assert len(fila) >= 2, fila
    assert fila[0] not in valores, f"estado duplicado: {fila[0]}"
    valores[fila[0]] = int(float(fila[1]))
for estado, etiqueta in etiquetas.items():
    assert etiqueta in valores, f"falta la etiqueta {etiqueta}"
    assert valores[etiqueta] == expected[estado], (etiqueta, valores[etiqueta], expected[estado])
assert set(valores) == set(etiquetas.values()) | {"Total"}, valores
assert valores["Total"] == sum(valores[etiqueta] for etiqueta in etiquetas.values())
assert valores["Total"] == sum(expected.values())
print("conteos y total correctos:", valores["Total"])
PY
then ok 'reporte administrativo coincide con el dashboard y no duplica ofertas'; else fail 'reporte administrativo no coincide con el dashboard'; fi

paso "6. reporte de empresa: etiquetas legibles y estado efectivo"
check_code 'empresa descarga XLSX' 200 "$(curl -s -o "$EMPRESA_XLSX" -w '%{http_code}' "$B/api/empresa/reportes/excel?desde=2000-01-01&hasta=2099-01-01" -H "Authorization: Bearer $TE")"
EMPRESA_SHEETS=$(hojas "$EMPRESA_XLSX")
if [ "$EMPRESA_SHEETS" = "Resumen	Postulaciones	Contrataciones	Ofertas" ]; then
    ok 'se conservan las hojas y su orden del reporte de empresa'
else
    fail "hojas de empresa inesperadas: $EMPRESA_SHEETS"
fi
leer_hoja "$EMPRESA_XLSX" "Ofertas" > /tmp/opencode/empresa_ofertas.tsv
if python3 - /tmp/opencode/empresa_ofertas.tsv <<'PY'
import sys
filas = [line.rstrip("\n").split("\t") for line in open(sys.argv[1], encoding="utf-8")]
assert filas[0][:2] == ["Puesto", "Estado"], filas[0]
esperado = {
    "Reporte estado borrador": "Borrador",
    "Reporte estado pendiente": "Pendiente de revisión",
    "Reporte estado publicada": "Publicada",
    "Reporte publicada vencida": "Vencida",
    "Reporte publicada sin cierre": "Publicada",
    "Reporte estado cerrada": "Cerrada",
    "Reporte estado observada": "Observada",
    "Reporte estado rechazada": "Rechazada",
}
por_puesto = {fila[0]: fila[1] for fila in filas[1:] if fila}
for puesto, etiqueta in esperado.items():
    assert puesto in por_puesto, f"falta la oferta {puesto}"
    assert por_puesto[puesto] == etiqueta, (puesto, por_puesto[puesto], etiqueta)
assert not (set(por_puesto.values()) & {"borrador", "pendiente", "publicada", "vencida", "cerrada", "observada", "rechazada"})
print("etiquetas de empresa correctas")
PY
then ok 'empresa traduce los siete estados y una publicada vencida figura como Vencida'; else fail 'empresa no tradujo todos los estados'; fi

printf '\nFIN reporte de estados\n'
[ "$fallos" -eq 0 ] || exit 1
