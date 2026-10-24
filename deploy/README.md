# Despliegue de SOL

Docker es la única vía oficial de desarrollo y operación. Hay un archivo
privado por entorno, normalmente `.env` en la raíz. También puede usar otro
nombre y pasarlo con `ENV_FILE`; solo se versiona `.env.example`.

## Estructura

```text
SOL/
├── .env                    # privado, no versionado
├── .env.example            # plantilla sin secretos
├── backend/
│   ├── Dockerfile
│   ├── php.ini             # límites de subida/memoria comunes
│   └── php.prod.ini        # OPcache de producción
├── frontend/
│   ├── Dockerfile
│   └── nginx.conf
└── deploy/
    ├── compose.yaml        # servicios base
    ├── compose.dev.yaml    # desarrollo
    ├── compose.prod.yaml   # producción + Nginx interno
    ├── infra/traefik/      # Traefik compartido, plantilla ACME y entrada SOL
    ├── nginx/              # plantillas, render y certificados legado
    └── scripts/            # bootstrap, deploy, dev, validate, test, backup, restore
```

Las pruebas de despliegue están en `tests/deploy/` y `tests/infra/`; el
workflow `.github/workflows/ci.yml` ejecuta validación, pruebas y smoke local
sin secretos de producción.

## Requisitos del host

- Docker Engine >= 24 y Docker Compose >= 2.24 (`docker compose`).
- Git, shell POSIX, `awk`, `grep`, `sed`, `stat` y `curl` para diagnóstico.
- No se requiere PHP, Composer, Node.js, npm, MySQL ni `node_modules` en el host.

## Infraestructura compartida

En un VPS con varios proyectos, **Traefik es el único servicio que publica
80/443**. Su stack vive en `deploy/infra/traefik/` y crea la red compartida
`proxy` y la red exclusiva `sol_entry`. SOL conserva su Nginx como gateway
interno, sin puertos publicados, conectado solo a `sol_entry` y a su red
interna.

La configuración ACME tiene una **única fuente**: la plantilla estática
`deploy/infra/traefik/traefik.yml`, renderizada al arrancar por
`deploy/infra/traefik/entrypoint.sh` con `ACME_EMAIL`, `ACME_CA_SERVER` y
`PROXY_NETWORK`. No se agregan argumentos `--certificatesresolvers` a Compose;
Traefik no los aplica cuando usa `--configFile`. El resolver se llama
`letsencrypt`.

Orden de despliegue:

1. `deploy/infra/traefik` (DNS y ACME configurados).
2. SOL con `SOL_ENTRY_NETWORK=sol_entry`, `TRAEFIK_ENTRY_IP=172.31.0.2`,
   `NGINX_MODE=http`, dominios y URLs HTTPS.

Consulte `deploy/infra/traefik/README.md`.

### Contexto de producción conocido

El despliegue operativo descrito para esta instalación es:

- dominio público `ufe.a-415.win`, VPS `148.113.149.93`;
- Cloudflare administra DNS y proxy público;
- Traefik v3.6 publica 80/443 y ya emitió un certificado Let's Encrypt;
- proyecto Compose `sol_prod` y red de entrada `sol_entry`;
- volumen ACME `sol_infra_traefik_acme`;
- `SystemSeeder` ya se ejecutó; no se debe volver a ejecutar.

Estos datos son contexto operativo; esta tarea no se conecta al VPS ni modifica
su `.env`, certificados, redes o volúmenes. Antes de aplicar cambios, el
operador debe confirmar el estado real con los comandos de sólo lectura de
`deploy/infra/traefik/README.md`.

## Servicios

- `db`: MySQL 8.0.46. Producción no publica puertos; desarrollo usa
  `127.0.0.1:3307`.
- `backend`: PHP-FPM 8.4.27 con CodeIgniter 4. En desarrollo ejecuta
  `php spark serve`; en producción, PHP-FPM.
- `frontend`: build de Vite servido por Nginx en producción; en desarrollo
  ejecuta Vite con recarga automática.
- `nginx`: gateway interno de producción; enruta el frontend y `/api`/`/health`
  al backend. **No publica puertos al host.**
- `traefik` (infraestructura separada): publica 80/443 y enruta por dominio.
- `adminer`: opcional en desarrollo; perfil `tools`, en `127.0.0.1:8082`.

La red interna es `sol_<proyecto>_internal`; los volúmenes son
`sol_<proyecto>_mysql_data`, `sol_<proyecto>_backend_writable` y, en producción,
`sol_<proyecto>_nginx_conf`. El nombre se toma de `COMPOSE_PROJECT_NAME` y los
scripts lo pasan explícitamente a Compose. Producción rechaza `sol_dev`.

En producción, el servicio `nginx` se conecta a la red externa exclusiva
`entry` (`SOL_ENTRY_NETWORK`, por defecto `sol_entry`) creada por Traefik. Es
una red interna, sin salida directa a Internet. No se conecta a `proxy` y no
publica puertos al host. Nginx solo acepta
conexiones desde la IP fija de Traefik (`TRAEFIK_ENTRY_IP`) en esa red (y
localhost para su healthcheck) y solo confía en esa IP para
`X-Forwarded-For`/`X-Forwarded-Proto`; no se usa la subred compartida del
proxy para determinar la IP del cliente.

Desarrollo publica únicamente en `127.0.0.1` los puertos 5173, 8080, 3307 y
8082. Producción no publica puertos en SOL; únicamente Traefik publica 80/443.
PHP-FPM y MySQL no publican puertos ni se conectan a `proxy`/`sol_entry`.

## Comandos

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh shell backend
./deploy/scripts/dev.sh exec backend php spark routes
./deploy/scripts/dev.sh db
./deploy/scripts/dev.sh tools              # Adminer opcional
./deploy/scripts/dev.sh migrate            # explícito
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes  # solo pruebas
./deploy/scripts/dev.sh down               # conserva volúmenes

./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --prod
./deploy/scripts/validate.sh --build
./deploy/scripts/validate.sh --runtime
./deploy/scripts/validate.sh --prod --runtime --public-smoke
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh http
./deploy/scripts/test.sh validation
./deploy/scripts/test.sh smoke

./deploy/scripts/backup.sh dev
./deploy/scripts/backup.sh prod
./deploy/scripts/restore.sh --help
./deploy/scripts/bootstrap.sh --prod --authorize   # instalación nueva
./deploy/scripts/deploy.sh                          # actualización existente

# Infraestructura compartida (una vez por VPS)
cd deploy/infra/traefik
cp .env.example .env
chmod 600 .env
# completar ACME_EMAIL y revisar PROXY_NETWORK, PROXY_SUBNET,
# SOL_ENTRY_NETWORK, SOL_ENTRY_SUBNET, TRAEFIK_ENTRY_IP y
# TRAEFIK_SOCKET_NETWORK
docker compose --env-file .env -f compose.yaml config
docker compose --env-file .env -f compose.yaml up -d
```

Los scripts localizan la raíz del repositorio y pasan `--env-file` y
`--project-name` a Compose, por lo que funcionan desde cualquier directorio.
No instalan dependencias en el host.

## Validación preventiva y health

`validate.sh` rechaza antes de construir o recrear servicios:

- Turnstile deshabilitado en producción, secret/site key ausentes,
  `turnstile.hostnames` con protocolo/ruta o sin el `APP_DOMAIN` exacto.
- Un solo `google.clientId`/`VITE_GOOGLE_CLIENT_ID`, o IDs distintos.
- Dominios con protocolo/ruta, `APP_URL`/`app.baseURL` fuera del origen
  esperado, CORS sin el origen del frontend y `VITE_API_URL` incoherente.
- Secretos vacíos, de ejemplo o débiles; contraseñas MySQL iguales; variables
  duplicadas; secretos versionados.
- Configuración ACME duplicada, resolver distinto de `letsencrypt`, storage
  incorrecto, dashboard inseguro o socket proxy escribible.

`test.sh validation` ejecuta pruebas sin usar el `.env` real:
`tests/deploy/test_validation.sh`, `tests/deploy/test_internal_health.sh` y
`tests/infra/test_traefik_acme.sh`.

El health de producción tiene dos capas:

- **Interno:** `nginx_internal_health` ejecuta `wget` dentro del contenedor
  Nginx con `Host: $API_DOMAIN` contra `127.0.0.1/health`. No usa DNS público,
  Cloudflare ni certificados. Bootstrap, deploy y restore lo usan como
  condición de éxito.
- **Público:** `PUBLIC_SMOKE=1` o `validate.sh --runtime --public-smoke`
  comprueba el dominio, HTTPS y el certificado. Es independiente y no debe
  ejecutarse durante una instalación cuyo DNS aún no está disponible.

## Ambientes de entorno

Se mantiene una plantilla única, `.env.example`, y archivos privados por
entorno seleccionados con `ENV_FILE`. Se evaluó duplicar plantillas completas
de desarrollo y producción; se descartó porque dos copias de más de cien
variables generan deriva y riesgo de mezclar secretos. `.gitignore` ignora
`.env` y `.env.*` salvo `.env.example`; `.dockerignore` los excluye de las
imágenes. Para producción use un archivo privado distinto y
`COMPOSE_PROJECT_NAME=sol_prod`.

Desarrollo usa `sol_dev`, `localhost`, HTTP local, una base/volúmenes propios
y no necesita ACME. Los puertos se publican solo en `127.0.0.1` y se pueden
cambiar con `DEV_API_PORT`, `DEV_FRONTEND_PORT`, `DEV_DB_PORT` y
`DEV_ADMINER_PORT`. Adminer es opcional (`dev.sh tools`). No copie secretos,
JWT, claves de cifrado ni el cliente OAuth de producción al `.env` local.

Ejemplo de entorno local separado:

```bash
cp .env.example .env.dev.local
chmod 600 .env.dev.local
# edite URLs, puertos y credenciales de desarrollo
export ENV_FILE="$PWD/.env.dev.local"
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/test.sh http
./deploy/scripts/dev.sh down   # no elimina volúmenes
```

No copie `.env.dev.local` a otro equipo ni lo agregue a Git. Para producción,
use un archivo privado distinto y pase `ENV_FILE` a los scripts; nunca copie
el `.env` de producción al repositorio.

## Imágenes y actualización de versiones

Versiones fijadas actualmente:

| Componente | Imagen |
|---|---|
| Backend | `php:8.4.27-fpm-alpine3.23` |
| Composer | `composer:2.8.12` |
| Frontend | `node:22.23.4-alpine` |
| Servidor frontend | `nginx:1.27.5-alpine` |
| Base de datos | `mysql:8.0.46` |
| Administración dev | `adminer:5.3.0` |
| Utilidades temporales | `alpine:3.21` |

Procedimiento autorizado para actualizar:

1. Revisar notas de la versión y compatibilidad con CodeIgniter/React.
2. Cambiar la etiqueta exacta en el Dockerfile o Compose correspondiente.
3. Ejecutar `./deploy/scripts/validate.sh --build --build-prod` con el `.env` de producción.
4. Ejecutar `./deploy/scripts/test.sh all`.
5. Probar en un entorno aislado antes de `deploy.sh`.

Las etiquetas fijas reducen variaciones, pero no garantizan reproducibilidad
absoluta: el registro de imágenes, las dependencias de Composer/npm y los
servicios externos siguen siendo fuentes externas. No se usan etiquetas
`latest` en los builds oficiales.

## Nginx y TLS

`deploy/nginx/render.sh` corre dentro del contenedor y renderiza la plantilla
según `NGINX_MODE`:

- `http`: **modo usado en producción detrás de Traefik**; Traefik termina TLS.
  Renderiza dominio único si `APP_DOMAIN=API_DOMAIN`, o subdominios si son
  distintos.
- `same-domain`: legado para Nginx standalone con TLS propio.
- `subdomain`: legado para Nginx standalone con TLS propio.

En la arquitectura con proxy compartido, SOL usa `NGINX_MODE=http`, no monta
certificados ni se conecta a `proxy`, y no publica puertos. En subdominios, el
host de API solo responde con la API y no devuelve el frontend. Las plantillas
HTTPS se conservan para compatibilidad con instalaciones standalone, pero no
se usan en el flujo oficial.

Los certificados y la renovación ACME viven en `deploy/infra/traefik`. No se
generan certificados automáticamente dentro de SOL.

## Turnstile y Google OAuth

En producción Turnstile debe estar habilitado:

```dotenv
turnstile.enabled=true
turnstile.secretKey=<secreto solo backend>
VITE_TURNSTILE_SITE_KEY=<site key pública>
turnstile.hostnames=<APP_DOMAIN exacto>
```

`turnstile.hostnames` admite una lista separada por comas, sin protocolo, ruta
ni puerto. El validador normaliza espacios/mayúsculas y exige el hostname
exacto de `APP_DOMAIN`. En desarrollo puede quedar `turnstile.enabled=false` o
usar las claves de prueba publicadas por Cloudflare para su dominio de pruebas;
no use esas claves en producción.

Google OAuth se habilita solo cuando `google.clientId` y
`VITE_GOOGLE_CLIENT_ID` están presentes y son el mismo cliente web; si falta
uno o no coinciden, la validación falla. Autorice estos orígenes en Google
Cloud Console:

- Desarrollo: `http://localhost:<DEV_FRONTEND_PORT>` (por defecto
  `http://localhost:5173`).
- Producción: `https://<APP_DOMAIN>` (por ejemplo, el dominio público
  configurado; no use el dominio de desarrollo).

`VITE_GOOGLE_CLIENT_ID` es una variable de compilación de Vite: después de
cambiarla hay que reconstruir la imagen del frontend. Use un cliente OAuth de
desarrollo independiente del de producción.

## Checklist de despliegue

Antes:

- DNS A/AAAA de `APP_DOMAIN` y `API_DOMAIN` apuntando al VPS; Cloudflare sin
  bloqueo del desafío `/.well-known/acme-challenge/`.
- `ACME_EMAIL` y `ACME_CA_SERVER` en `deploy/infra/traefik/.env`.
- Redes `proxy` y `sol_entry`, IP `TRAEFIK_ENTRY_IP`, puertos 80/443 libres.
- `.env` privado de producción con proyecto `sol_prod`, dominios y URLs
  HTTPS, Turnstile y Google configurados.
- `./deploy/scripts/validate.sh --prod` y `./deploy/scripts/test.sh validation`.
- Respaldo verificado y ventana de mantenimiento.

Después:

- `nginx_internal_health` correcto; opcionalmente `PUBLIC_SMOKE=1`.
- `https://<APP_DOMAIN>/health` responde 200; certificado válido y HSTS.
- Login, Turnstile y Google según corresponda; CORS del frontend.
- Logs de Traefik sin errores ACME ni router con resolver inexistente.
- Volúmenes `sol_prod_mysql_data`, `sol_prod_backend_writable` y
  `sol_infra_traefik_acme` presentes; no se eliminó ninguno.

No use `bootstrap.sh` para una actualización ni ejecute `down -v`.

## Traslado a producción (fase separada)

Esta tarea no modifica el VPS. Para aplicar los cambios en una ventana
autorizada:

```bash
# 1. Revisar/actualizar el stack de infraestructura y conciliar ACME
cd deploy/infra/traefik
[ -f .env ] || cp .env.example .env
chmod 600 .env
# completar ACME_EMAIL, ACME_CA_SERVER y redes; no copiar secretos al repo
docker compose --env-file .env -f compose.yaml config
docker compose --env-file .env -f compose.yaml up -d

# 2. Validar SOL desde la raíz (sin construir ni recrear aún)
cd ../..
export ENV_FILE=/ruta/privada/sol_prod.env   # archivo privado de producción
./deploy/scripts/validate.sh --prod

# 3. Actualización existente; no usar bootstrap.sh
./deploy/scripts/backup.sh prod
./deploy/scripts/deploy.sh

# 4. Smoke público cuando DNS/TLS estén disponibles, sin redeploy
./deploy/scripts/validate.sh --prod --runtime --public-smoke
```

`bootstrap.sh --prod --authorize` es solo para una instalación nueva con la
base vacía. La instalación actual ya tiene migraciones, `SystemSeeder` y el
administrador; no se debe volver a ejecutar.

## Datos, respaldos y restauración

`backup.sh` usa `mysqldump` consistente y respalda el volumen
`backend_writable`. El destino por defecto es `$HOME/sol-backups`; use
`BACKUP_DIR` para cambiarlo. Los archivos quedan con permisos `600`, fuera del
repositorio, con manifiesto y SHA-256. No se sobrescriben. El servicio `db` debe
estar en ejecución (`dev.sh up` o `deploy.sh` lo asegura).

`restore.sh` es una operación separada y destructiva: exige `--env`, `--db`,
`--confirm "RESTORE:<proyecto>:<entorno>"` y, para producción,
`--allow-production`. Crea un respaldo de seguridad antes de restaurar, detiene
la aplicación, restaura el SQL, verifica tablas y `users`, opcionalmente
restaura `writable` y vuelve a levantar los servicios. No borra volúmenes ni
restaura automáticamente si falla.

Los CV alojados en Supabase no están en el volumen local; respáldelos también
desde el proveedor. Practique la restauración en un proyecto/volumen
desechable, nunca sobre los volúmenes reales.

No se ejecuta `docker compose down -v`, `docker volume prune`,
`docker system prune --volumes` ni `docker volume rm` en los procedimientos.
`dev.sh down`, `deploy.sh` y `restore.sh` conservan los volúmenes.

## Entorno filtrado del backend

Los scripts generan `deploy/runtime/backend.env` (permisos `600`, ignorado por
Git). El servicio backend lo consume mediante `BACKEND_ENV_FILE`; no recibe la
contraseña root de MySQL, las credenciales iniciales, variables `VITE_*` ni
configuración de Nginx/TLS. Use los scripts para operar el stack. Si ejecuta
Compose manualmente, defina `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"`.
