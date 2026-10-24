# Operaciones de SOL

Docker es la única vía oficial. Los comandos de aplicación se ejecutan dentro de
contenedores; no se requiere PHP, Composer, Node.js, npm ni MySQL en el host.

## 1. Configuración centralizada

Hay un archivo privado por entorno, normalmente `.env` en la raíz, creado a
partir de `.env.example`:

```bash
cp .env.example .env
chmod 600 .env
```

También puede usar otro nombre privado y seleccionarlo con `ENV_FILE`; las
plantillas versionadas son únicamente `.env.example`.

No se mantienen `.env` en `backend/` ni `frontend/`. Para cambiar de entorno se
selecciona otro archivo y se pasa `ENV_FILE` a los scripts; no se copian
secretos entre desarrollo y producción. En el servidor de producción se
recomienda un `.env` propio, por ejemplo con `COMPOSE_PROJECT_NAME=sol_prod`.
Los scripts de producción rechazan `sol_dev` como nombre de proyecto.

Los scripts generan `deploy/runtime/backend.env` con permisos `600` y una lista
explícita de variables del backend. Este archivo derivado, ignorado por Git,
excluye `DB_ROOT_PASSWORD`, `INITIAL_ADMIN_*`, `VITE_*`, `DEV_*`, `NGINX_*`,
`TLS_*`, `ACME_*`, `TRAEFIK_*`, `PROXY_*` y `SOL_ENTRY_*`. No lo edite ni lo
versione; se regenera desde el `.env` seleccionado.
Si necesita ejecutar Compose manualmente, exporte
`BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"` después de que un script lo
haya generado.

CodeIgniter carga el archivo raíz mediante `Config\Paths::$envDirectory`.
Vite lo lee en desarrollo mediante `envDir='..'`; en Docker/Vite solo recibe las
variables `VITE_*` públicas por variables de proceso o build args.

Variables principales:

- Aplicación: `CI_ENVIRONMENT`, `COMPOSE_PROJECT_NAME`, `SOL_ENTRY_NETWORK`,
  `TRAEFIK_ENTRY_IP`, `APP_URL`, `app.baseURL`, `app.appTimezone`,
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

`validate.sh` comprueba además que Turnstile esté habilitado en producción
cuando corresponda, que `turnstile.hostnames` contenga el `APP_DOMAIN` exacto,
que Google use el mismo cliente web en backend/frontend, que dominios/URLs/CORS
sean coherentes y que el resolver ACME sea único y se llame `letsencrypt`.

## 2. Desarrollo local

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes   # opcional; modifica datos
./deploy/scripts/dev.sh down                           # conserva volúmenes
```

URLs por defecto: frontend `http://localhost:5173`, API
`http://localhost:8080`, MySQL `127.0.0.1:3307`. Adminer es opcional:
`./deploy/scripts/dev.sh tools` lo inicia en `http://localhost:8082`.

Los puertos se publican únicamente en `127.0.0.1` y se personalizan en el
`.env` local con `DEV_API_PORT`, `DEV_FRONTEND_PORT`, `DEV_DB_PORT` y
`DEV_ADMINER_PORT`; cambie también `APP_URL`, `app.baseURL`,
`cors.allowedOrigins` y `VITE_API_URL` si cambia los puertos. Desarrollo no
necesita ACME ni certificados públicos y no debe copiar secretos, JWT, claves
de cifrado ni clientes OAuth de producción.

Ejemplo con archivo privado separado:

```bash
cp .env.example .env.dev.local
chmod 600 .env.dev.local
export ENV_FILE="$PWD/.env.dev.local"
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/test.sh http
./deploy/scripts/dev.sh down   # conserva volúmenes
```

No versione `.env.dev.local`; `.gitignore` y `.dockerignore` ya excluyen los
archivos `.env.*` salvo la plantilla.

`migrate` y `seed` son explícitos. `up` y `restart` no ejecutan seeders.
`seed` exige `--yes`, solo acepta `DatosPruebaSeeder` o `DatosMasivosSeeder` y
rechaza `SystemSeeder`; la instalación inicial se hace con `bootstrap.sh`.

Comandos de trabajo dentro de contenedores:

```bash
./deploy/scripts/dev.sh shell backend
./deploy/scripts/dev.sh exec backend php spark migrate:status
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit
./deploy/scripts/dev.sh db
```

## 3. Validación y pruebas

```bash
./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --prod
./deploy/scripts/validate.sh --build
./deploy/scripts/validate.sh --build-prod   # requiere .env de producción
./deploy/scripts/validate.sh --runtime
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh http
./deploy/scripts/test.sh validation
./deploy/scripts/test.sh smoke
```

`validate.sh` distingue fallos críticos de advertencias. `--runtime` usa el
health check **interno** de Nginx en producción y no depende de DNS público.
`--runtime --public-smoke` añade la comprobación pública de dominio, HTTPS y
certificado. `test.sh http` es un smoke no destructivo contra el stack de
desarrollo y requiere `dev.sh up`.

La instalación inicial y las actualizaciones usan el health interno; el smoke
público es una verificación independiente. Si DNS aún no resuelve, una
instalación que ya está sana no se marca como fallida por ese motivo. Para
forzar la comprobación pública: `PUBLIC_SMOKE=1 ./deploy/scripts/deploy.sh`.

Se mantiene una plantilla única `.env.example`; los archivos privados por
entorno se seleccionan con `ENV_FILE`. Se evaluó duplicar plantillas completas
de desarrollo y producción y se descartó porque generarían deriva de más de
cien variables y riesgo de mezclar secretos. `.env` y `.env.*` están
ignorados; solo se versionan las plantillas `.env.example`.

El workflow `.github/workflows/ci.yml` ejecuta validación de scripts/Compose,
pruebas de backend, frontend, build, validación preventiva y smoke HTTP local
con un `.env` sintético. No usa secretos reales, DNS de producción, Cloudflare
ni certificados públicos.

## 4. Instalación nueva en VPS

1. Clonar el repositorio y entrar en él.
2. Desplegar primero la infraestructura compartida de Traefik:
   `deploy/infra/traefik/README.md`. Deben existir las redes `proxy` y
   `sol_entry`, DNS apuntando al VPS y `ACME_EMAIL`/`ACME_CA_SERVER`
   configurados. La plantilla `traefik.yml` se renderiza al arrancar; no
   agregue argumentos ACME a Compose.
3. Copiar `.env.example` a `.env` y completar dominios, base de datos,
   `INITIAL_ADMIN_*`, JWT, cifrado, correo, almacenamiento e integraciones.
4. Usar `COMPOSE_PROJECT_NAME` distinto de `sol_dev`, por ejemplo `sol_prod`.
5. Configurar `SOL_ENTRY_NETWORK=sol_entry`,
   `TRAEFIK_ENTRY_IP=172.31.0.2`, `NGINX_MODE=http`, `APP_URL`,
   `app.baseURL`, CORS, `VITE_API_URL`, Turnstile y Google según
   `deploy/README.md`. **No** configure certificados TLS dentro de SOL en este
   modo: los gestiona Traefik. No conecte el Nginx de SOL a la red compartida
   `proxy`.
6. Ejecutar, revisando antes el entorno de destino:

```bash
./deploy/scripts/bootstrap.sh --prod --authorize
```

El script exige `--authorize`, comprueba que Traefik y la red exclusiva
`sol_entry` existan, valida que la base esté vacía, construye imágenes, espera
MySQL, aplica migraciones, ejecuta **solo** `SystemSeeder`, verifica el
administrador y levanta Nginx. La comprobación final es el health interno de
Nginx; el DNS público no es requisito para completar el bootstrap. Si la base
ya contiene usuarios se detiene: para actualizar use `deploy.sh`. No se ejecuta
desde `up`, `restart` ni `deploy.sh`.

## 5. Actualizaciones

```bash
./deploy/scripts/backup.sh prod
./deploy/scripts/deploy.sh
```

`deploy.sh` exige `CI_ENVIRONMENT=production`, un proyecto distinto de
`sol_dev`, `NGINX_MODE=http`, la red exclusiva `sol_entry` y Traefik en
ejecución; verifica que la base ya tenga usuarios, crea un respaldo verificado,
construye imágenes, aplica migraciones y recrea los servicios sin eliminar
volúmenes. **No ejecuta SystemSeeder** y no restablece contraseñas de
administradores existentes. El health final es interno; use `PUBLIC_SMOKE=1`
para exigir además el dominio y el certificado públicos.

Si una comprobación crítica falla, el proceso se detiene con código distinto de
cero. No use `down -v` para "arreglar" el problema: conserve el estado y el
respaldo para recuperación. `deploy.sh` no restaura automáticamente.

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
- `sol-writable-<fecha>.tar.gz` con el volumen `backend_writable`, si existe.
- `sol-backup-<fecha>.txt` con fecha, entorno, proyecto, nombres, tamaños y
  SHA-256, sin secretos.

Los archivos quedan con permisos `600`, no se sobrescriben y se verifica que el
SQL contenga tablas y que el tar.gz sea legible. No se borran respaldos
automáticamente. Los CV alojados en Supabase no están dentro del volumen local;
respáldelos también desde el proveedor.

Restauración oficial (operación destructiva y explícita). Primero practique en
un entorno desechable; nunca use los volúmenes reales para una prueba:

```bash
# El script crea un respaldo de seguridad antes de restaurar, detiene la
# aplicación y no elimina el volumen.
./deploy/scripts/restore.sh \
  --env dev \
  --db "$HOME/sol-backups/sol-db-AAAAMMDD-HHMMSS.sql" \
  --files "$HOME/sol-backups/sol-writable-AAAAMMDD-HHMMSS.tar.gz" \
  --confirm "RESTORE:sol_dev:dev"

# Producción exige además --allow-production.
./deploy/scripts/restore.sh \
  --env prod \
  --db /ruta/segura/sol-db-AAAAMMDD-HHMMSS.sql \
  --confirm "RESTORE:sol_prod:prod" \
  --allow-production
```

El script verifica el tar.gz antes de detener servicios, restaura el SQL,
comprueba que existan tablas y la tabla `users`, inicia los servicios y valida
el health interno de Nginx (no requiere DNS público). La restauración de
archivos sobrescribe los nombres presentes en el tar pero no elimina archivos
adicionales del volumen; para un reemplazo total use un volumen nuevo y
autorizado. Después de restaurar, valide conteos, relaciones y flujos
funcionales antes de reabrir el servicio.

No use `down -v`, `docker volume rm` ni `docker volume prune` para restaurar.
No sobrescriba el volumen bueno sin un respaldo verificado. El respaldo de
seguridad generado por `restore.sh` es la vía de reversión.

## 8. Traefik, Nginx y certificados

La arquitectura oficial de producción usa un **Traefik compartido**:

- Traefik publica 80/443 y termina TLS.
- Crea la red compartida `proxy` para otros proyectos y la red exclusiva
  `sol_entry` para la entrada de SOL.
- SOL Nginx se conecta solo a `sol_entry` y a su red `internal`, sin `ports`
  al host. No se conecta a `proxy`.
- Traefik usa una IP fija en `sol_entry`; Nginx solo acepta conexiones de esa
  IP (y localhost para su healthcheck) y solo confía en ella para
  `X-Forwarded-For` y `X-Forwarded-Proto`.
- Traefik enruta `APP_DOMAIN` y `API_DOMAIN` al Nginx de SOL por HTTP interno.
- PHP-FPM y MySQL no se conectan a `proxy` ni a `sol_entry`, y no publican
  puertos.

Los modos `same-domain` y `subdomain` de las plantillas Nginx quedan como
legado para un Nginx standalone con TLS propio. En el flujo oficial SOL usa
`NGINX_MODE=http`; no monta certificados. Si `APP_DOMAIN` y `API_DOMAIN` son
iguales, se renderiza la plantilla de dominio único; si son distintos, se
renderiza la de subdominios y el host de API no devuelve el frontend.

La configuración ACME tiene una única fuente en
`deploy/infra/traefik/traefik.yml`: es una plantilla que `entrypoint.sh`
renderiza al arrancar con `ACME_EMAIL`, `ACME_CA_SERVER` y `PROXY_NETWORK`.
Traefik no aplica los argumentos `--certificatesresolvers...` combinados con
`--configFile`; por eso no se declaran en Compose. El resolver se llama
exactamente `letsencrypt` y `/acme/acme.json` vive en el volumen
`sol_infra_traefik_acme`.

Procedimiento TLS:

1. Configure DNS A/AAAA de los dominios hacia el VPS. Si Cloudflare actúa como
   proxy, asegúrese de que el desafío HTTP-01 en
   `/.well-known/acme-challenge/` llega al origen y no está bloqueado por WAF,
   reglas o caché. Para la primera emisión puede ser necesario usar DNS-only
   temporalmente.
2. Complete `ACME_EMAIL` y `ACME_CA_SERVER` en
   `deploy/infra/traefik/.env`; use producción solo tras validar staging.
3. Levante Traefik con la plantilla renderizada; Let's Encrypt HTTP-01 emitirá
   y renovará los certificados.
4. Para pruebas, use un proyecto/volumen temporales y `ACME_CA_SERVER` de
   staging; no use el volumen `sol_infra_traefik_acme` de producción.
5. Verifique `https://<APP_DOMAIN>/health` y el certificado. El health interno
   se comprueba por separado dentro del contenedor Nginx.

Consulte `deploy/infra/traefik/README.md` para logs, red, recuperación,
permisos de `acme.json` y alta de otros proyectos. No se incluyen dominios,
correos ni credenciales reales en el repo.

No se generan certificados ficticios ni se incluyen claves privadas en Git.

## 9. Servicios externos pendientes de configurar

Antes de producción complete y valide con credenciales reales:

- Google OAuth: `google.clientId` y `VITE_GOOGLE_CLIENT_ID` con el mismo
  cliente web, o ambos vacíos. Autorice `http://localhost:<DEV_FRONTEND_PORT>`
  (por defecto `http://localhost:5173`) en desarrollo y
  `https://<APP_DOMAIN>` en producción. Use clientes OAuth independientes y
  reconstruya el frontend al cambiar `VITE_GOOGLE_CLIENT_ID`.
- Cloudflare Turnstile: `turnstile.enabled=true` en producción, site key pública
  en `VITE_TURNSTILE_SITE_KEY`, secret key solo en backend y
  `turnstile.hostnames` con el `APP_DOMAIN` exacto, sin protocolo, ruta ni
  puerto. En desarrollo puede desactivarse o usar las claves de prueba de
  Cloudflare.
- Supabase Storage: `storage.driver=supabase`, endpoint S3, bucket privado
  indicado en `storage.bucket` (la plantilla usa `cvs`; confirme el bucket real),
  access/secret keys y prueba de subida/descarga firmada.
- Resend/SMTP: remitente de dominio verificado y prueba controlada.
- SUNAT/RENIEC: tokens de los proveedores y prueba de consulta.
- DNS, TLS, firewall y renovación del VPS: validar en una ventana separada.
  El contexto operativo indica que `ufe.a-415.win` ya tiene certificado, pero
  esta tarea no se conectó al VPS para comprobarlo.

No se ejecutaron envíos de correo, migraciones de producción ni operaciones que
creen recursos externos durante la verificación local.

## 9.1 Diagnóstico rápido

DNS/TLS:

```bash
getent hosts <APP_DOMAIN>
curl -I https://<APP_DOMAIN>/health
docker logs --tail=200 "$(docker ps -q --filter label=com.sol.infra=traefik)"
docker network inspect sol_entry
```

OAuth:

- Confirme que `google.clientId` y `VITE_GOOGLE_CLIENT_ID` son idénticos.
- Confirme el origen exacto en Google Cloud Console:
  `http://localhost:<DEV_FRONTEND_PORT>` y `https://<APP_DOMAIN>`.
- Si cambió `VITE_GOOGLE_CLIENT_ID`, reconstruya el frontend.

Turnstile:

- `turnstile.enabled=true` en producción.
- `turnstile.hostnames` debe contener el `APP_DOMAIN` exacto, sin protocolo ni
  ruta; no use un dominio incompleto.
- La secret key debe existir solo en backend; la site key es la única variable
  pública.
- Verifique que el hostname configurado en Cloudflare Turnstile coincide con
  el dominio real.

No imprima tokens, secret keys, contraseñas ni contenido de `.env` en logs.

## 9.2 Checklist pre/post despliegue

Antes:

- `validate.sh --prod` y `test.sh validation` sin fallos.
- DNS/Cloudflare, `ACME_EMAIL`, `ACME_CA_SERVER`, redes, IP de Traefik y
  puertos 80/443 revisados.
- Respaldo verificado y ventana de mantenimiento.
- Variables Turnstile/OAuth/URLs/CORS completas; secretos fuera de Git.

Después:

- Health interno correcto; smoke público con `--public-smoke` si DNS/TLS ya
  están disponibles.
- Certificado y HSTS correctos; logs de Traefik sin errores ACME.
- Login, Turnstile, Google y CORS probados desde el navegador.
- Volúmenes y respaldos presentes; no se ejecutó `down -v`.

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

## 11. Operaciones prohibidas en el flujo ordinario

No ejecute sobre datos reales:

- `docker compose down -v`, `docker volume rm`, `docker volume prune` ni
  `docker system prune --volumes`.
- Migraciones o seeders contra producción fuera de `deploy.sh`/`bootstrap.sh`.
- `SystemSeeder` desde `up`, `restart`, `deploy.sh` o `dev.sh`.
- Restauraciones sobre volúmenes reales sin un respaldo verificado y una
  confirmación explícita.
- `php spark`, Composer, `npm install`, `npm run dev` o MySQL instalados en el
  host como sustituto de los contenedores.

Los seeders de prueba (`DatosPruebaSeeder`, `DatosMasivosSeeder`) abortan con
`CI_ENVIRONMENT=production`. `dev.sh seed` exige `--yes` y rechaza
`SystemSeeder`.

## 12. Verificación de extremo a extremo

```bash
./deploy/scripts/validate.sh --dev
./deploy/scripts/test.sh all
./deploy/scripts/dev.sh up
./deploy/scripts/test.sh http
./deploy/scripts/dev.sh status
```

Para una instalación nueva aislada, use un `ENV_FILE` propio y un
`COMPOSE_PROJECT_NAME` distinto, ejecute `bootstrap.sh --dev --authorize`,
verifique `/health` y luego `backup.sh dev`. Practique `restore.sh` solo en un
proyecto/volumen desechable, nunca sobre `sol_dev`/`sol_prod` reales.

Una comprobación no ejecutada no se considera superada. Los servicios externos
(SUNAT/RENIEC, Google, Turnstile, Supabase, Resend/SMTP), TLS/DNS y una
restauración real de producción requieren credenciales y autorización externas;
quedan pendientes hasta ejecutarlos en el entorno correspondiente.
