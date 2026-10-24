#!/bin/sh
# Comprueba de forma read-only el volumen ACME y los permisos de acme.json.
# No imprime el contenido ni datos de certificados.
set -eu

VOLUME=${TRAEFIK_ACME_VOLUME:-sol_infra_traefik_acme}

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

command -v docker >/dev/null 2>&1 || die "Docker no está disponible."
docker volume inspect "$VOLUME" >/dev/null 2>&1 || die "No existe el volumen ACME '$VOLUME'."

container=$(docker ps -q --filter 'label=com.sol.infra=traefik' --filter status=running | head -n 1)
[ -n "$container" ] || die "Traefik no está en ejecución; no se puede comprobar /acme/acme.json."

if ! docker exec "$container" test -f /acme/acme.json; then
    printf 'PENDIENTE: /acme/acme.json aún no existe; se creará en la primera emisión ACME.\n'
    exit 0
fi

perm=$(docker exec "$container" stat -c '%a' /acme/acme.json 2>/dev/null || true)
case "$perm" in
    600|400) printf 'OK   %s:/acme/acme.json tiene permisos %s.\n' "$VOLUME" "$perm" ;;
    '') die "No se pudieron leer los permisos de /acme/acme.json." ;;
    *) die "Los permisos de /acme/acme.json son $perm; se esperaba 600 o 400." ;;
esac
