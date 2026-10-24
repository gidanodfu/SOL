#!/bin/sh
# Verifica que el resolver ACME letsencrypt se inicialice y que el router
# temporal pueda referenciarlo. No publica puertos ni contacta Let's Encrypt:
# apunta a un CA local inaccesible para que el intento sea totalmente local.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
C="sol_traefik_acme_test_$$"
D=$(mktemp -d "${TMPDIR:-/tmp}/sol-traefik-dynamic.XXXXXX")
A=$(mktemp -d "${TMPDIR:-/tmp}/sol-traefik-acme.XXXXXX")
LOG=$(mktemp "${TMPDIR:-/tmp}/sol-traefik-log.XXXXXX")
chmod 755 "$D" "$A"

cleanup() {
    docker rm -f "$C" >/dev/null 2>&1 || true
    rm -rf "$D" "$A" "$LOG"
}
trap cleanup EXIT HUP INT TERM

cat > "$D/router.yml" <<'EOF'
http:
  routers:
    test-acme:
      rule: Host(`test.invalid`)
      entryPoints: [websecure]
      service: test
      tls:
        certResolver: letsencrypt
  services:
    test:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:80
EOF

docker run -d --rm --name "$C" \
    -e ACME_EMAIL=ci@example.com \
    -e ACME_CA_SERVER=http://127.0.0.1:18099/directory \
    -e PROXY_NETWORK=proxy_test \
    -v "$ROOT/deploy/infra/traefik/traefik.yml:/etc/traefik/traefik.yml.template:ro" \
    -v "$ROOT/deploy/infra/traefik/entrypoint.sh:/entrypoint.sh:ro" \
    -v "$D:/etc/traefik/dynamic:ro" \
    -v "$A:/acme" \
    --entrypoint /entrypoint.sh \
    traefik:v3.6 --configFile=/tmp/traefik.rendered.yml >/dev/null

ready=0
i=0
while [ "$i" -lt 20 ]; do
    if docker logs "$C" >"$LOG" 2>&1 && grep -Fq 'Starting provider *acme.Provider' "$LOG"; then
        ready=1
        break
    fi
    sleep 1
    i=$((i + 1))
done

if [ "$ready" != "1" ]; then
    printf 'FAIL el resolver ACME letsencrypt no se inicializó\n' >&2
    tail -30 "$LOG" >&2 || true
    exit 1
fi

if grep -Fq 'nonexistent certificate resolver' "$LOG"; then
    printf 'FAIL el router no pudo referenciar el resolver letsencrypt\n' >&2
    tail -30 "$LOG" >&2
    exit 1
fi

rendered=$(docker exec "$C" cat /tmp/traefik.rendered.yml)
printf '%s\n' "$rendered" | grep -Fq 'email: ci@example.com' \
    || { printf 'FAIL el correo ACME no se renderizó\n' >&2; exit 1; }
printf '%s\n' "$rendered" | grep -Fq 'caServer: http://127.0.0.1:18099/directory' \
    || { printf 'FAIL el CA ACME no se renderizó\n' >&2; exit 1; }
printf '%s\n' "$rendered" | grep -Fq 'network: proxy_test' \
    || { printf 'FAIL la red del proveedor Docker no se renderizó\n' >&2; exit 1; }
if printf '%s\n' "$rendered" | grep -Fq '__ACME_' || printf '%s\n' "$rendered" | grep -Fq '__PROXY_'; then
    printf 'FAIL quedaron placeholders sin renderizar\n' >&2
    exit 1
fi

printf 'OK   resolver ACME letsencrypt inicializado y usado por un router temporal\n'
