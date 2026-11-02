#!/bin/sh
# Verifica que Nginx no exponga .git, .github, .env ni otros dotfiles internos.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
C="sol_private_paths_test_$$"
D=$(mktemp -d "${TMPDIR:-/tmp}/sol-private-paths.XXXXXX")
fallos=0

cleanup() {
    docker rm -f "$C" >/dev/null 2>&1 || true
    rm -rf "$D"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$D/html/.git" "$D/html/.github/workflows"
printf 'index\n' > "$D/html/index.html"
printf '[core]\n\trepositoryformatversion = 0\n' > "$D/html/.git/config"
printf 'name: CI\n' > "$D/html/.github/workflows/ci.yml"
printf 'SECRETO=no-publicar\n' > "$D/html/.env"
cp "$ROOT/frontend/nginx.conf" "$D/default.conf"

docker run -d --rm --name "$C" --network none \
    -v "$D/default.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$D/html:/usr/share/nginx/html:ro" \
    nginx:1.27.5-alpine >/dev/null

for _ in $(seq 1 30); do
    if docker exec "$C" wget -qO- http://127.0.0.1/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.2
done

if ! docker exec "$C" nginx -t >/dev/null 2>&1; then
    printf 'FAIL nginx -t\n' >&2
    exit 1
fi
printf 'OK   configuración Nginx válida\n'

estado() {
    ruta=$1
    docker exec "$C" wget -q -S -O /dev/null "http://127.0.0.1$ruta" 2>&1 \
        | awk '/HTTP\// { print $2; exit }' || true
}

esperar() {
    ruta=$1
    esperado=$2
    real=$(estado "$ruta")
    if [ "$real" = "$esperado" ]; then
        printf 'OK   %-32s HTTP %s\n' "$ruta" "$real"
    else
        printf 'FAIL %-32s HTTP %s (esperado %s)\n' "$ruta" "${real:-sin respuesta}" "$esperado" >&2
        fallos=$((fallos + 1))
    fi
}

esperar / 200
esperar /index.html 200
esperar /.git 404
esperar /.git/config 404
esperar /.github 404
esperar /.github/workflows/ci.yml 404
esperar /.env 404

for plantilla in "$ROOT"/deploy/nginx/templates/*.template; do
    if grep -Fq 'location ~ /\.(?!well-known' "$plantilla"; then
        printf 'OK   plantilla con bloqueo de dotfiles: %s\n' "$(basename "$plantilla")"
    else
        printf 'FAIL plantilla sin bloqueo de dotfiles: %s\n' "$(basename "$plantilla")" >&2
        fallos=$((fallos + 1))
    fi
done


cat > "$D/render-check.sh" <<'SH'
#!/bin/sh
set -eu
envsubst '${APP_DOMAIN} ${API_DOMAIN} ${TRAEFIK_ENTRY_IP} ${TLS_CERT_PATH} ${TLS_KEY_PATH}' \
    < "/templates/$1" > /etc/nginx/conf.d/default.conf
nginx -t
SH
chmod +x "$D/render-check.sh"

for plantilla in app.http.conf.template app.http.subdomain.conf.template; do
    if docker run --rm --entrypoint sh --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 \
        -e APP_DOMAIN=app.test -e API_DOMAIN=api.test -e TRAEFIK_ENTRY_IP=172.31.0.2 \
        -v "$ROOT/deploy/nginx/templates:/templates:ro" \
        -v "$D/render-check.sh:/render-check.sh:ro" \
        nginx:1.27.5-alpine /render-check.sh "$plantilla" >/dev/null 2>&1; then
        printf 'OK   plantilla renderizada y validada: %s\n' "$plantilla"
    else
        printf 'FAIL plantilla inválida: %s\n' "$plantilla" >&2
        fallos=$((fallos + 1))
    fi
done

[ "$fallos" -eq 0 ] || exit 1
