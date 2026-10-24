# Nginx

`render.sh` se ejecuta dentro del contenedor Nginx antes de iniciar el servidor.
Selecciona la plantilla según `NGINX_MODE` y la renderiza en
`/etc/nginx/conf.d/default.conf` con `envsubst`.

En producción con Traefik, SOL usa `NGINX_MODE=http`: este Nginx es un gateway
interno sin puertos publicados. Traefik termina TLS y le envía HTTP por la red
`proxy`.

Modalidades:

- `http`: HTTP interno detrás de Traefik (modo oficial de producción) o HTTP
  directo en un entorno standalone.
- `same-domain`: legado para Nginx standalone con TLS propio.
- `subdomain`: legado para Nginx standalone con TLS propio.

Las plantillas HTTPS se conservan para compatibilidad, pero el flujo oficial
centraliza TLS/ACME en `deploy/infra/traefik`. No se montan certificados dentro
de SOL en la arquitectura con proxy compartido.

Las plantillas usan variables explícitas; no se sustituyen las variables
internas de Nginx (`$uri`, `$host`, etc.).

En una instalación **standalone legacy** con `NGINX_MODE=https`/`same-domain`
o `subdomain`, los archivos deben estar en `TLS_CERTS_DIR` y se montan en
`/etc/nginx/certs` como solo lectura. En la arquitectura oficial con Traefik no
se montan certificados en SOL. Las plantillas HTTPS incluyen HSTS,
`X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`; el modo HTTP
interno no envía HSTS (lo añade Traefik). El límite de cuerpo es 12 MB,
alineado con `backend/php.ini` (`upload_max_filesize=10M`, `post_max_size=12M`).
