#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Flujo APIsPERU con mock HTTP local: verificación DNI/RUC, token canónico y
# persistencia en MariaDB sin consumir el proveedor real.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
MOCK_PORT=19090
MOCK=/tmp/mock_apisperu_$$.py
LOG=/tmp/opencode/spark_apisperu_mock_$$.log
mkdir -p /tmp/opencode

cat > "$MOCK" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, sys

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if '/dni/70000099' in self.path:
            data = {
                'dni': '70000099',
                'nombres': 'MOCK',
                'apellidoPaterno': 'PRUEBA',
                'apellidoMaterno': 'MARIADB',
            }
        elif '/ruc/20123456789' in self.path:
            data = {
                'ruc': '20123456789',
                'razonSocial': 'EMPRESA MOCK S.A.C.',
                'nombreComercial': 'MOCK',
                'direccion': 'AV. MOCK 123',
                'distrito': 'CHICLAYO',
                'provincia': 'CHICLAYO',
                'departamento': 'LAMBAYEQUE',
            }
        else:
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
PY

python3 "$MOCK" "$MOCK_PORT" >/dev/null 2>&1 &
MOCK_PID=$!
trap 'kill "$SRV" "$MOCK_PID" 2>/dev/null; rm -f "$MOCK" "$LOG"' EXIT HUP INT TERM

export apisperu.baseURL="http://127.0.0.1:${MOCK_PORT}/api/v1"
export apisperu.token=token-mock-local
export apisperu.timeout=5

for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:${MOCK_PORT}/api/v1/dni/70000099" && break; sleep 0.2; done

php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fallos=$((fallos + 1)); }
fallos=0

paso "1. Verificación RUC con proveedor mock"
RUC_JSON=$(curl -s -X POST "$B/api/verificar-ruc" -H 'Content-Type: application/json' -d '{"ruc":"20123456789"}')
printf '%s' "$RUC_JSON" | python3 -c '
import sys,json
d=json.load(sys.stdin)
assert d.get("success") is True, "respuesta no exitosa"
x=d["data"]
assert x["razon_social"]=="EMPRESA MOCK S.A.C.", x
assert x["nombre_comercial"]=="MOCK", x
assert "AV. MOCK 123" in x["direccion"], x
print("OK   datos RUC normalizados")
' && ok 'verificación RUC' || fail 'verificación RUC'

paso "2. Solicitud empresarial persistida desde el mock"
SOL_CODE=$(curl -s -o /tmp/opencode/sol_mock_$$.json -w '%{http_code}' -X POST "$B/api/solicitudes-empresa" \
  -H 'Content-Type: application/json' \
  -d '{"ruc":"20123456789","email":"mock.empresa@example.test","telefono":"999888777","representante":"Representante Mock","terms_accepted":true}')
if [ "$SOL_CODE" = "201" ]; then ok 'solicitud creada (201)'; else fail "solicitud HTTP $SOL_CODE"; fi

php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";port=".getenv("DB_PORT").";dbname=".getenv("DB_DATABASE").";charset=utf8mb4", getenv("DB_USER"), getenv("DB_PASSWORD"));
$fila = $pdo->query("SELECT razon_social, nombre_comercial, direccion FROM solicitudes_empresa WHERE ruc=\"20123456789\"")->fetch(PDO::FETCH_ASSOC);
if (!$fila || $fila["razon_social"] !== "EMPRESA MOCK S.A.C." || $fila["nombre_comercial"] !== "MOCK" || !str_contains($fila["direccion"], "AV. MOCK 123")) { fwrite(STDERR, "datos persistidos incorrectos\n"); exit(1); }
echo "OK   razón social, nombre comercial y dirección persistidos\n";
' && ok 'persistencia RUC en MariaDB' || fail 'persistencia RUC en MariaDB'

paso "3. Verificación DNI y token canónico"
DNI_JSON=$(curl -s -X POST "$B/api/verificar-dni" -H 'Content-Type: application/json' -d '{"dni":"70000099"}')
printf '%s' "$DNI_JSON" | python3 -c '
import sys,json
d=json.load(sys.stdin)
assert d.get("success") is True, "respuesta no exitosa"
x=d["data"]
assert x["nombres"]=="MOCK" and x["apellidos"]=="PRUEBA MARIADB", x
assert x.get("dni_token"), "sin dni_token"
print("OK   DNI normalizado y token emitido")
' && ok 'verificación DNI' || fail 'verificación DNI'
TOKEN=$(printf '%s' "$DNI_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["dni_token"])')

paso "4. Registro ignora nombres manipulados y persiste la identidad del token"
REG_CODE=$(curl -s -o /tmp/opencode/reg_mock_$$.json -w '%{http_code}' -X POST "$B/api/registro/postulante" \
  -H 'Content-Type: application/json' \
  -d "{\"dni\":\"70000099\",\"nombres\":\"Hackeado\",\"apellidos\":\"Manipulado\",\"email\":\"mock.postulante@example.test\",\"telefono\":\"999888776\",\"password\":\"Clave12345!\",\"password2\":\"Clave12345!\",\"terms_accepted\":true,\"dni_token\":\"$TOKEN\"}")
if [ "$REG_CODE" = "200" ] || [ "$REG_CODE" = "201" ]; then ok "registro creado ($REG_CODE)"; else fail "registro HTTP $REG_CODE"; cat /tmp/opencode/reg_mock_$$.json; fi

php -r '
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";port=".getenv("DB_PORT").";dbname=".getenv("DB_DATABASE").";charset=utf8mb4", getenv("DB_USER"), getenv("DB_PASSWORD"));
$fila = $pdo->query("SELECT nombres, apellidos FROM postulantes WHERE dni=\"70000099\"")->fetch(PDO::FETCH_ASSOC);
if (!$fila || $fila["nombres"] !== "MOCK" || $fila["apellidos"] !== "PRUEBA MARIADB") { fwrite(STDERR, "identidad persistida incorrecta\n"); exit(1); }
echo "OK   identidad canónica persistida (nombres/apellidos del token)\n";
' && ok 'identidad canónica en MariaDB' || fail 'identidad canónica en MariaDB'

if [ "$fallos" -gt 0 ]; then
    echo "APIsPERU mock: $fallos fallo(s)."
    exit 1
fi
echo "APIsPERU mock: OK"
