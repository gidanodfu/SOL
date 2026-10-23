#!/bin/sh
# Smoke HTTP no destructivo contra el stack de desarrollo activo.
# No crea, modifica ni elimina datos. Requiere curl en el host.
set -u

B=${B:-http://127.0.0.1:8080}
F=${F:-http://127.0.0.1:5173}
fallos=0
BODY=$(mktemp "${TMPDIR:-/tmp}/sol-http.XXXXXX") || exit 1
trap 'rm -f "$BODY"' EXIT HUP INT TERM

check() {
    nombre="$1"
    esperado="$2"
    metodo="$3"
    url="$4"
    codigo=$(curl -sS -o "$BODY" -w '%{http_code}' -X "$metodo" "$url" 2>/dev/null) || codigo=000
    if [ "$codigo" = "$esperado" ]; then
        printf 'OK   %-45s %s\n' "$nombre" "$codigo"
    else
        printf 'FAIL %-45s %s (esperado %s)\n' "$nombre" "$codigo" "$esperado"
        fallos=$((fallos + 1))
    fi
}

body_check() {
    nombre="$1"
    patron="$2"
    if grep -Fq "$patron" "$BODY" 2>/dev/null; then
        printf 'OK   %-45s contiene %s\n' "$nombre" "$patron"
    else
        printf 'FAIL %-45s no contiene %s\n' "$nombre" "$patron"
        fallos=$((fallos + 1))
    fi
}

if ! command -v curl >/dev/null 2>&1; then
    printf 'ERROR: se requiere curl para la prueba HTTP. Use la imagen de diagnóstico o instale curl en el host.\n' >&2
    exit 1
fi

printf 'Smoke HTTP SOL\n'
printf 'API: %s\n' "$B"
printf 'Frontend: %s\n' "$F"

check 'GET /health' 200 GET "$B/health"
body_check 'GET /health' '"status":"ok"'

check 'GET / institucional' 200 GET "$B/"
body_check 'GET / institucional' '"success":true'

check 'GET /api/ofertas público' 200 GET "$B/api/ofertas"
check 'GET /api/auth/me sin token' 401 GET "$B/api/auth/me"

codigo=$(curl -sS -o "$BODY" -w '%{http_code}' -X OPTIONS \
    -H 'Origin: http://localhost:5173' \
    -H 'Access-Control-Request-Method: GET' \
    "$B/api/ofertas" 2>/dev/null) || codigo=000
if [ "$codigo" = "204" ]; then
    printf 'OK   %-45s %s\n' 'OPTIONS /api/ofertas CORS' "$codigo"
else
    printf 'FAIL %-45s %s (esperado 204)\n' 'OPTIONS /api/ofertas CORS' "$codigo"
    fallos=$((fallos + 1))
fi

check 'GET frontend SPA' 200 GET "$F/"
body_check 'GET frontend SPA' '<div id="root">'

check 'GET frontend /health' 200 GET "$F/health"

printf '\nResultado: %s fallo(s).\n' "$fallos"
[ "$fallos" -eq 0 ]
