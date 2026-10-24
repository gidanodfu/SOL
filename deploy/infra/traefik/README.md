# Infraestructura compartida: Traefik

Este stack es **infraestructura del VPS**, no parte de SOL. Publica únicamente
los puertos públicos `80/443` y enruta por dominio hacia los proyectos que se
conecten a la red externa `proxy`.

```
Internet
  │ 80/443
  ▼
Traefik (este stack)
  │ red Docker externa `proxy`
  ├── SOL Nginx interno:80 → PHP-FPM / frontend
  ├── otro proyecto Nginx:80
  └── ...
```

## Requisitos

- Docker Engine >= 24 y Docker Compose >= 2.24.
- DNS de cada dominio apuntando al VPS (A/AAAA) antes de solicitar Let's Encrypt.
- Puertos 80 y 443 libres en el host.
- Correo para ACME. No se guarda ninguna contraseña en este stack.

## Puesta en marcha

```bash
cd deploy/infra/traefik
cp .env.example .env
chmod 600 .env
# Editar .env:
#   ACME_EMAIL=correo-operaciones@dominio-real
#   PROXY_NETWORK=proxy
#   PROXY_SUBNET=172.30.0.0/24
#   TRAEFIK_SOCKET_NETWORK=traefik_socket
#   TRAEFIK_HTTP_PORT=80
#   TRAEFIK_HTTPS_PORT=443
# Para pruebas use ACME_CA_SERVER de staging.
docker compose --env-file .env -f compose.yaml config
docker compose --env-file .env -f compose.yaml up -d
```

Comprobar:

```bash
docker compose --env-file .env -f compose.yaml ps
docker network inspect proxy
docker compose --env-file .env -f compose.yaml logs -f traefik
```

No hay dashboard público. El API de Traefik no se expone.

## TLS y renovación

Se usa **Let's Encrypt con HTTP-01**:

- `entryPoints.web` (80) redirige a `websecure` (443).
- `certificatesResolvers.letsencrypt` solicita y renueva certificados.
- Los certificados se guardan en el volumen `traefik_acme`.
- La renovación es automática mientras Traefik esté activo y el puerto 80
  siga accesible.
- Para ensayos, `ACME_CA_SERVER` puede apuntar al directorio staging de Let's
  Encrypt; no use staging para producción.

El **TLS termina en Traefik**. SOL Nginx recibe HTTP por la red privada.

## Red compartida

Este compose crea la red:

```text
proxy
```

Los proyectos que quieran recibir tráfico deben:

1. Declarar la red como externa:

```yaml
networks:
  proxy:
    external: true
    name: ${PROXY_NETWORK:-proxy}
```

2. Conectar el servicio de entrada del proyecto a `proxy`.
3. Declarar labels de Traefik con `traefik.enable=true` y un router único.
4. No publicar `80/443` en el proyecto.

El stack de SOL ya está preparado en `deploy/compose.prod.yaml`.

## Seguridad del socket Docker

Traefik **no monta `/var/run/docker.sock` directamente**. Habla con
`tecnativa/docker-socket-proxy`, que:

- monta el socket como solo lectura;
- expone únicamente operaciones de lectura necesarias para descubrir
  contenedores, redes, eventos y versión;
- bloquea `POST`, `DELETE`, `EXEC`, volúmenes, imágenes, secretos y escritura;
- está en una red privada `traefik_socket`, no en `proxy`, por lo que los
  proyectos no pueden alcanzar el API del socket proxy.

No publique el puerto `2375` del socket proxy. Solo debe ser accesible desde la
red `proxy` y por Traefik.

## Añadir otro proyecto

Cada proyecto debe usar un router propio:

```yaml
services:
  nginx:
    networks:
      - internal
      - proxy
    labels:
      traefik.enable: "true"
      traefik.docker.network: proxy
      traefik.http.routers.mi-proyecto.rule: Host(`app.midominio.gob.pe`)
      traefik.http.routers.mi-proyecto.entrypoints: websecure
      traefik.http.routers.mi-proyecto.tls: "true"
      traefik.http.routers.mi-proyecto.tls.certresolver: letsencrypt
      traefik.http.services.mi-proyecto.loadbalancer.server.port: "80"
    # Sin ports: Traefik es el único que publica 80/443.
```

No use el nombre de router `sol` en otro proyecto. Traefik tiene
`exposedByDefault: false`: solo los contenedores con labels explícitas se
publican.

## Recuperación

```bash
cd deploy/infra/traefik
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=200 traefik
docker compose --env-file .env -f compose.yaml restart traefik
```

Validar que la red existe:

```bash
docker network inspect proxy
```

Si Traefik no arranca, revise:

- que 80/443 no estén ocupados por otro proceso;
- que `ACME_EMAIL` no esté vacío;
- que DNS resuelva al VPS;
- que `proxy` exista y los servicios estén conectados;
- que `PROXY_SUBNET` coincida con la subred real de `proxy` (se usa para
  `real_ip` en Nginx);
- los logs de `socket-proxy` y `traefik`.

No ejecute `docker compose down -v` ni elimine el volumen `traefik_acme` si
quiere conservar certificados y estado ACME.

## Limitaciones

- La configuración no está desplegada ni validada contra un dominio real en
  esta auditoría.
- La emisión ACME HTTP-01 requiere que el puerto 80 sea accesible desde
  Internet; si el VPS usa otro balanceador, ajuste el modo de desafío.
- Un certificado wildcard requeriría un desafío DNS y un proveedor DNS; no se
  incluye porque no se dispone de credenciales ni dominio real.
