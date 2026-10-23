# Operaciones de SOL

## 1. Configuración centralizada

Hay un único archivo privado: `.env` en la raíz. Se crea a partir de
`.env.example`:

```bash
cp .env.example .env
chmod 600 .env
```

No se mantienen `.env` en `backend/` ni `frontend/`. Para cambiar de entorno se
selecciona otro archivo y se pasa `ENV_FILE` a los scripts; no se copian
secretos entre desarrollo y producción. En el servidor de producción se
recomienda un `.env` propio, por ejemplo con `COMPOSE_PROJECT_NAME=sol_prod`.

Los scripts generan `deploy/runtime/backend.env` con permisos `600` y una lista
explícita de variables del backend. Este archivo derivado, ignorado por Git,
excluye `DB_ROOT_PASSWORD`, `INITIAL_ADMIN_*`, `VITE_*`, `DEV_*`, `NGINX_*` y
`TLS_*`. No lo edite ni lo versione; se regenera desde el `.env` seleccionado.
Si necesita ejecutar Compose manualmente, exporte
`BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"` después de que un script lo
haya generado.

CodeIgniter carga el archivo raíz mediante `Config\Paths::$envDirectory`.
Vite lo lee en desarrollo mediante `envDir='..'`; en Docker/Vite solo recibe las
variables `VITE_*` públicas por variables de proceso o build args.

Variables principales:

- Aplicación: `CI_ENVIRONMENT`, `APP_URL`, `app.baseURL`, `app.appTimezone`,
  `cors.allowedOrigins`, `APP_DOMAIN`, `API_DOMAIN`, `NGINX_MODE`.
- Base de datos: `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`,
  `DB_ROOT_PASSWORD`, `DB_DRIVER` y `DB_PREFIX`.
- Seguridad: `encryption.key`, `jwt.secret`, duraciones JWT,
  `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`.
- Almacenamiento: `storage.driver`, `storage.bucket`, `s3.*`.
- Integraciones: `sunat.token`, `jsonpe.token` (alias legado `dni.token` aceptado por compatibilidad), `RESEND_*`,
  `email.*`, `google.clientId`, `turnstile.*`.
- Frontend público: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`,
  `VITE_TURNSTILE_SITE_KEY`.

Nunca incluya la secret key de Turnstile, credenciales S3, tokens de correo o
contraseñas en variables `VITE_*`.

## 2. Desarrollo local

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh seed DatosPruebaSeeder   # opcional; modifica datos
./deploy/scripts/dev.sh down                     # conserva volúmenes
```

URLs por defecto: frontend `http://localhost:5173`, API
`http://localhost:8080`, MySQL `127.0.0.1:3307`, Adminer
`http://localhost:8082`.

`migrate` y `seed` son explícitos. `up` y `restart` no ejecutan seeders.

## 3. Validación y pruebas

```bash
./deploy/scripts/validate.sh
./deploy/scripts/validate.sh --build
./deploy/scripts/validate.sh --runtime
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
```

`validate.sh` distingue fallos críticos de advertencias. `--runtime` solo
comprueba endpoints si el entorno ya está levantado; una comprobación omitida
no se considera superada.

## 4. Instalación nueva en VPS

1. Clonar el repositorio y entrar en él.
2. Copiar `.env.example` a `.env` y completar dominios, base de datos,
   `INITIAL_ADMIN_*`, JWT, correo, almacenamiento e integraciones.
3. Configurar `NGINX_MODE` y los certificados si se usa HTTPS.
4. Ejecutar:

```bash
./deploy/scripts/bootstrap.sh --prod
```

El script valida que la base esté vacía, construye imágenes, espera MySQL,
aplica migraciones, ejecuta `SystemSeeder`, verifica el administrador y levanta
Nginx. Si la base ya contiene usuarios se detiene: para actualizar use
`deploy.sh`.

## 5. Actualizaciones

```bash
./deploy/scripts/backup.sh prod
./deploy/scripts/deploy.sh
```

`deploy.sh` exige `CI_ENVIRONMENT=production`, valida certificados si
corresponden, crea un respaldo, construye imágenes, aplica migraciones y
recrea los servicios sin eliminar volúmenes. **No ejecuta SystemSeeder** y no
restablece contraseñas de administradores existentes.

Si una comprobación crítica falla, el proceso se detiene. No use `down -v`
para "arreglar" el problema: conserve el estado y el respaldo para recuperación.

## 6. Base de datos y persistencia

- Volumen MySQL: `sol_<proyecto>_mysql_data`.
- Volumen de escritura del backend: `sol_<proyecto>_backend_writable`
  (`writable/cache`, `logs`, `session`, `uploads`).
- Los CV se almacenan en Supabase si `storage.driver=supabase`; no se duplican
  en un volumen local.
- Los archivos locales de `writable/uploads` se migraron al volumen de
  escritura cuando correspondía.

Para migrar datos desde una instalación anterior, el procedimiento es:
detener escrituras, generar un `mysqldump` consistente, restaurarlo en la nueva
base, comparar conteos por tabla, comprobar integridad referencial y recién
entonces retirar contenedores antiguos. No se eliminan volúmenes antiguos
automáticamente.

Si proviene del compose anterior (`empleo_mysql`, `empleo_adminer`, volumen
`sol_empleo_mysql_data`), conserve ese volumen hasta confirmar la migración y
el periodo de recuperación. Los contenedores antiguos pueden retirarse, pero el
volumen no debe borrarse sin una autorización explícita.

## 7. Respaldos y restauración

```bash
BACKUP_DIR=/ruta/fuera/del/repo ./deploy/scripts/backup.sh prod
```

El script genera:

- `sol-db-<fecha>.sql` con `mysqldump --single-transaction --routines --triggers`.
- `sol-writable-<fecha>.tar.gz` con el volumen `backend_writable`.

Los archivos quedan con permisos `600`. No se sobrescriben respaldos y no se
borran automáticamente.

Restauración controlada (ejemplo; sustituya nombres y fechas). El entorno
filtrado del backend debe existir antes de invocar Compose directamente:

```bash
# 0. Genere el entorno filtrado y expórtelo (no contiene la contraseña root).
./deploy/scripts/validate.sh >/dev/null
export BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"

# 1. Detenga la aplicación (sin -v).
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml stop backend frontend nginx

# 2. Restaure el SQL en la base de datos de destino.
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml exec -T db \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"' < sol-db-AAAAMMDD-HHMMSS.sql

# 3. Extraiga writable en el volumen de destino (preferiblemente uno nuevo).
docker run --rm \
  -v sol_prod_backend_writable:/dest \
  -v "$PWD:/backup:ro" \
  alpine sh -c 'tar xzf /backup/sol-writable-AAAAMMDD-HHMMSS.tar.gz -C /dest'

# 4. Arranque y valide conteos, integridad y /health.
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d
```

Valide primero en un entorno aislado, no sobrescriba el volumen bueno sin
respaldo y no use `down -v` sobre datos que deban conservarse.

## 8. Nginx y certificados

Modos:

- `http`: útil detrás de un proxy TLS externo o en pruebas.
- `same-domain`: frontend y `/api` en el mismo dominio (recomendado).
- `subdomain`: frontend y API en dominios distintos; ajuste CORS,
  `VITE_API_URL` y `app.baseURL`.

Coloque `fullchain.pem` y `privkey.pem` en `TLS_CERTS_DIR` y use
`NGINX_MODE=same-domain` o `subdomain`. No versione certificados ni claves.

Procedimiento de renovación recomendado:

1. Emita/renueve el certificado en el host con Certbot.
2. Copie o sincronice `fullchain.pem` y `privkey.pem` al directorio configurado.
3. Compruebe correspondencia, fechas y nombres de dominio.
4. Recargue Nginx mediante el procedimiento de despliegue o
   `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env" docker compose ... exec nginx nginx -s reload`.
5. Verifique HTTPS y `/health`.

No se generan certificados ficticios ni se incluyen claves privadas en Git.

## 9. Servicios externos pendientes de configurar

Antes de producción complete y valide con credenciales reales:

- Google OAuth: `google.clientId` y `VITE_GOOGLE_CLIENT_ID`; autorizar el origen.
- Cloudflare Turnstile: site key pública en `VITE_TURNSTILE_SITE_KEY`, secret
  key solo en backend, `turnstile.hostnames` del dominio real.
- Supabase Storage: `storage.driver=supabase`, endpoint S3, bucket privado
  indicado en `storage.bucket` (la plantilla usa `cvs`; confirme el bucket real),
  access/secret keys y prueba de subida/descarga firmada.
- Resend/SMTP: remitente de dominio verificado y prueba controlada.
- SUNAT/RENIEC: tokens de los proveedores y prueba de consulta.
- DNS, TLS y firewall del VPS.

No se ejecutaron envíos de correo, migraciones de producción ni operaciones que
creen recursos externos durante la verificación local.

## 10. Rotación de credenciales

Las credenciales locales de MySQL, JWT, cifrado y administrador inicial se
rotaron durante la auditoría. Las credenciales de servicios externos presentes
en el `.env` de desarrollo no se pueden rotar desde este repositorio: si el
`.env`, sus respaldos o registros de operación se compartieron, rote antes de
producción las claves de Resend, Supabase S3, SUNAT, JSONPE y Turnstile, y
actualice el `.env` y los backends correspondientes. No versione los valores ni
los incluya en `VITE_*`.

El historial de Git conserva archivos retirados con credenciales literales:
`backend/env.production.example` (claves S3 y contraseña de correo) y
`docker-compose.yml` (contraseñas de MySQL). No se reescribió el historial; rote
esas credenciales y, si se autoriza, purgue esos archivos del historial. El
volumen antiguo y los respaldos conservan credenciales históricas; no se
eliminan en esta tarea.
