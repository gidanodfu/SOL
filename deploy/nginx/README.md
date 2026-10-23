# Nginx

`render.sh` se ejecuta dentro del contenedor Nginx antes de iniciar el servidor.
Selecciona la plantilla según `NGINX_MODE` y la renderiza en
`/etc/nginx/conf.d/default.conf` con `envsubst`.

Modalidades:

- `http`: HTTP directo (desarrollo o TLS terminado por un proxy externo).
- `same-domain`: `https://APP_DOMAIN` para el frontend y `https://APP_DOMAIN/api`
  para la API. Es la modalidad recomendada.
- `subdomain`: `https://APP_DOMAIN` para el frontend y `https://API_DOMAIN`
  para la API. En este caso `VITE_API_URL` y `app.baseURL` deben apuntar al
  subdominio de la API y CORS debe autorizar el dominio del frontend.

Las plantillas usan variables explícitas; no se sustituyen las variables
internas de Nginx (`$uri`, `$host`, etc.).

Para HTTPS, los archivos deben estar en `TLS_CERTS_DIR` y se montan en
`/etc/nginx/certs` como solo lectura.
