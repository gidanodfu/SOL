#!/bin/sh
# Verifica que el servidor Nginx del frontend entregue WebP como image/webp y
# conserve PNG/JPEG. Usa la misma imagen base y configuración de producción.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
C="sol_webp_nginx_test_$$"
D=$(mktemp -d "${TMPDIR:-/tmp}/sol-webp-nginx.XXXXXX")

cleanup() {
    docker rm -f "$C" >/dev/null 2>&1 || true
    rm -rf "$D"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$D/html"
cp "$ROOT/frontend/nginx.conf" "$D/default.conf"

# Imágenes 8x8 válidas generadas sin dependencias del host.
printf '%s' 'UklGRj4AAABXRUJQVlA4IDIAAADQAQCdASoIAAgAAMASJaACdLoB+AADsAD+91kv/xIX4kL8SF/4U1/7vN+09e09f0kAAA==' | base64 -d > "$D/html/test.webp"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWOUS9nCgA0wYRUdtBIA9jYBRu0P6b0AAAAASUVORK5CYII=' | base64 -d > "$D/html/test.png"
printf '%s' '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgACAAIAwERAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A8Ur+iz8PP//Z' | base64 -d > "$D/html/test.jpg"

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

fallos=0
probar() {
    archivo=$1
    esperado=$2
    cabeceras=$(docker exec "$C" wget -S -O "/tmp/$archivo" "http://127.0.0.1/$archivo" 2>&1) || true
    if printf '%s' "$cabeceras" | grep -qi "Content-Type: $esperado"; then
        printf 'OK   %-12s Content-Type: %s\n' "$archivo" "$esperado"
    else
        printf 'FAIL %-12s no devolvió %s\n' "$archivo" "$esperado" >&2
        fallos=$((fallos + 1))
    fi
    if docker exec "$C" cmp -s "/tmp/$archivo" "/usr/share/nginx/html/$archivo"; then
        printf 'OK   %-12s cuerpo íntegro\n' "$archivo"
    else
        printf 'FAIL %-12s cuerpo alterado\n' "$archivo" >&2
        fallos=$((fallos + 1))
    fi
}

probar test.webp image/webp
probar test.png image/png
probar test.jpg image/jpeg

[ "$fallos" -eq 0 ] || exit 1
printf 'Nginx: MIME WebP/PNG/JPEG correcto.\n'
