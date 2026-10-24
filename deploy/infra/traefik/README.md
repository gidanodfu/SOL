# Infraestructura compartida: Traefik

Este stack es **infraestructura del VPS**, no parte de SOL. Publica únicamente
los puertos públicos `80/443` y enruta por dominio.

```
Internet
  │ 80/443
  ▼
Traefik (este stack)
  ├── red compartida `proxy` ──▶ otros proyectos
  └── red exclusiva `sol_entry` ──▶ SOL Nginx:80 → PHP-FPM / frontend
```

Traefik se conecta a `proxy` para el enrutamiento general y a `sol_entry` para
la entrada de SOL. `sol_entry` es una red dedicada entre Traefik y el Nginx de
SOL; no se comparte con otros proyectos.

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
#   SOL_ENTRY_NETWORK=sol_entry
#   SOL_ENTRY_SUBNET=172.31.0.0/29
#   TRAEFIK_ENTRY_IP=172.31.0.2
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
docker network inspect sol_entry
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

## Redes

### `proxy`

Red compartida para proyectos que reciben tráfico de Traefik. Se crea con
`PROXY_NETWORK`/`PROXY_SUBNET` (por defecto `proxy` y `172.30.0.0/24`).

Los proyectos que quieran recibir tráfico por esta red deben:

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

### `sol_entry`

Red exclusiva entre Traefik y el Nginx de borde de SOL. Se crea como red
interna (sin salida directa a Internet) y con:

- `SOL_ENTRY_NETWORK=sol_entry`
- `SOL_ENTRY_SUBNET=172.31.0.0/29`
- `TRAEFIK_ENTRY_IP=172.31.0.2`

Traefik usa la IP fija `TRAEFIK_ENTRY_IP` en esa red. El stack de SOL declara
la red como externa (`SOL_ENTRY_NETWORK`) y **no** se conecta a `proxy`. Su
Nginx solo acepta conexiones desde la IP fija de Traefik en esa red (y
localhost para su healthcheck) y solo confía en esa IP para
`X-Forwarded-For` y `X-Forwarded-Proto`.

**No conecte otros proyectos a `sol_entry`.** Si otro contenedor se une a esa
red, podría intentar alcanzar el gateway de SOL directamente y falsificar
encabezados reenviados. El aislamiento de la red es parte del control de
seguridad.

Si la red `sol_entry` ya existe con otra subred, no la elimine con datos o
contenedores activos: inspecciónela con `docker network inspect sol_entry` y
ajuste `.env` de forma coherente antes de recrear.

## Seguridad del socket Docker

Traefik **no monta `/var/run/docker.sock` directamente**. Habla con
`tecnativa/docker-socket-proxy`, que:

- monta el socket como solo lectura;
- expone únicamente operaciones de lectura necesarias para descubrir
  contenedores, redes, eventos y versión;
- bloquea `POST`, `DELETE`, `EXEC`, volúmenes, imágenes, secretos y escritura;
- está en una red privada `traefik_socket`, no en `proxy` ni en `sol_entry`,
  por lo que los proyectos no pueden alcanzar el API del socket proxy.

No publique el puerto `2375` del socket proxy. Solo Traefik debe estar en la
red `traefik_socket`.

## Añadir otro proyecto

Cada proyecto que use la red compartida debe usar un router propio:

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

Si un proyecto necesita una red de entrada dedicada como SOL, Traefik debe
unirse también a esa red y el proyecto debe usar
`traefik.docker.network=<red-dedicada>`. No reutilice `sol_entry` para otro
proyecto.

## Recuperación

```bash
cd deploy/infra/traefik
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail=200 traefik
docker compose --env-file .env -f compose.yaml restart traefik
```

Validar redes:

```bash
docker network inspect proxy
docker network inspect sol_entry
```

Comprobar que Traefik está en `sol_entry` con la IP esperada:

```bash
docker inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{println $name $net.IPAddress}}{{end}}' \
  "$(docker ps -q --filter label=com.sol.infra=traefik)"
```

Si Traefik no arranca, revise:

- que 80/443 no estén ocupados por otro proceso;
- que `ACME_EMAIL` no esté vacío;
- que DNS resuelva al VPS;
- que `proxy` y `sol_entry` existan y los servicios estén conectados;
- que `TRAEFIK_ENTRY_IP` esté dentro de `SOL_ENTRY_SUBNET`;
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
