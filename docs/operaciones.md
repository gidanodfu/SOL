# Operaciones de SOL (desarrollo local)

> Documentación operativa sincronizada con SOL **1.5.4**. Describe únicamente el
> entorno local de desarrollo; el despliegue productivo queda fuera del repositorio.

Docker es la única vía oficial. Los comandos de aplicación se ejecutan dentro de
contenedores; no se requiere PHP, Composer, Node.js, npm ni MySQL en el host.

## 1. Configuración

```bash
cp .env.example .env
chmod 600 .env
```

El archivo `.env` de la raíz es la configuración local. Puede usar otro nombre
privado y seleccionarlo con `ENV_FILE`; la única plantilla versionada es
`.env.example`.

Variables principales:

| Grupo | Variables |
|---|---|
| Aplicación | `CI_ENVIRONMENT=development`, `APP_URL`, `app.baseURL`, `app.appTimezone`, `cors.allowedOrigins` |
| Compose | `COMPOSE_PROJECT_NAME`, `DEV_API_PORT`, `DEV_FRONTEND_PORT`, `DEV_DB_PORT`, `DEV_ADMINER_PORT` |
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` |
| Seguridad | `encryption.key`, `jwt.secret`, `jwt.accessExpiresMinutes`, `jwt.refreshExpiresDays`, `INITIAL_ADMIN_*` |
| Almacenamiento | `storage.driver`, `storage.bucket`, `s3.*` |
| Correo | `RESEND_*`, `email.*`, `activacion.expiraDias` |
| Identidad DNI/RUC | `apisperu.baseURL`, `apisperu.token`, `apisperu.timeout` (solo backend) |
| Google/Turnstile | `google.clientId`, `turnstile.*`, `VITE_*` |
| Rate limiting de CV | `cvRateLimit.*` |

No incluya secretos en Git. `deploy/runtime/backend.env` se genera con permisos
`600` y contiene solo las variables que el backend necesita.

### APIsPERU (DNI/RUC)

- `apisperu.token` es privado y solo lo recibe el backend.
- `apisperu.baseURL` y `apisperu.timeout` se configuran en el `.env` local.
- Sin token, las consultas devuelven un error controlado; no hay fallback a
  otros proveedores.
- Detalle de normalización, errores y migración en
  `docs/integraciones/apisperu.md`.


### Cloudflare Turnstile

- `turnstile.enabled` debe ser un booleano explícito. En desarrollo puede quedar
  en `false`; en un entorno protegido debe activarse junto con la Site Key, la
  Secret Key y los hostnames.
- `turnstile.secretKey` queda exclusivamente en el backend.
- `VITE_TURNSTILE_SITE_KEY` es pública y se compila en el frontend.
- `turnstile.hostnames` contiene hostnames sin protocolo, ruta ni puerto.
- Las acciones las decide el backend: `auth` para login, Google y registro de
  postulante; `registro_empresa` para afiliación empresarial.
- El backend valida siempre contra Siteverify. Token ausente, inválido, expirado,
  duplicado, error HTTP o de transporte rechaza la operación.
- El frontend solo renderiza el widget y transporta el token; no es una barrera
  de seguridad.

## 2. Arranque

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
```

Las dependencias PHP y npm se instalan dentro de las imágenes durante `up`.
Si cambia `composer.lock` o `package-lock.json`:

```bash
./deploy/scripts/dev.sh deps
```

No instale Composer, Node.js ni npm en el host. Para ejecutar herramientas:

```bash
./deploy/scripts/dev.sh exec backend php -v
./deploy/scripts/dev.sh exec backend composer --version
./deploy/scripts/dev.sh exec frontend node -v
./deploy/scripts/dev.sh exec frontend npm -v
./deploy/scripts/dev.sh exec db mysql --version
```

Generar secretos locales sin instalar PHP:

```bash
./deploy/scripts/dev.sh run backend php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
```

Servicios y puertos:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080` (`GET /health`)
- MySQL: `127.0.0.1:3307`
- Adminer: `127.0.0.1:8082` (`dev.sh tools`)

`dev.sh up` no aplica migraciones ni ejecuta seeders.

## 3. Instalación inicial

```bash
./deploy/scripts/bootstrap.sh --dev --authorize
```

Aplica todas las migraciones, ejecuta `SystemSeeder` una vez y verifica el
administrador inicial. Se detiene si la base ya contiene usuarios.

## 4. Migraciones y seeds

```bash
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
./deploy/scripts/dev.sh seed DatosMasivosSeeder --yes
```

- Las migraciones son la única fuente del esquema.
- No se modifican migraciones históricas.
- `SystemSeeder` solo se ejecuta mediante `bootstrap.sh`.
- Los seeders de prueba requieren `--yes`.

## 5. Pruebas

```bash
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh http
./deploy/scripts/test.sh smoke
./deploy/scripts/test.sh validation
```

`smoke` crea un MySQL temporal en `tmpfs`, un esquema aislado por suite y no
publica puertos. `http` requiere el stack de desarrollo activo.

## 6. Persistencia

| Volumen | Contenido |
|---|---|
| `sol_dev_mysql_data` | Datos de MySQL |
| `sol_dev_backend_writable` | Caché, logs y archivos de escritura |

`dev.sh down` conserva los volúmenes. No ejecute `docker compose down -v`,
`docker volume prune`, `docker system prune --volumes` ni `docker volume rm`.

Para reiniciar sin perder datos:

```bash
./deploy/scripts/dev.sh restart
```

## 7. Respaldos y restauración

```bash
./deploy/scripts/backup.sh dev
```

Genera:

- `sol-db-<fecha>.sql` — dump lógico de MySQL.
- `sol-writable-<fecha>.tar.gz` — volumen `writable`.
- `sol-backup-<fecha>.txt` — manifiesto con SHA-256.

Se guardan en `$HOME/sol-backups` por defecto (`BACKUP_DIR` para cambiarlo), fuera
del repositorio, con permisos `600`.

Restauración:

```bash
./deploy/scripts/restore.sh \
  --env dev \
  --db "$HOME/sol-backups/sol-db-<fecha>.sql" \
  --confirm "RESTORE:sol_dev:dev"
```

La restauración es destructiva. Crea un respaldo de seguridad, detiene la
aplicación, restaura el SQL, verifica tablas y `users`, y reinicia los servicios.

## 8. Almacenamiento de CV

- `storage.driver=local` guarda los archivos en el volumen `backend_writable`.
- `storage.driver=supabase` guarda el binario en Supabase Storage y los metadatos
  en MySQL. Los CV del proveedor externo no están en el volumen local: respáldelos
  desde Supabase.
- Un postulante mantiene un único CV activo; las versiones anteriores se conservan.
- La carga usa rate limiting por usuario e IP y una operación simultánea por
  postulante. Al superar el límite responde `429` con `Retry-After`.

## 9. Logs y diagnóstico

```bash
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh logs frontend
./deploy/scripts/dev.sh exec backend php spark routes
./deploy/scripts/dev.sh exec backend php spark migrate:status
./deploy/scripts/dev.sh cache
./deploy/scripts/dev.sh build-frontend
./deploy/scripts/dev.sh db
./deploy/scripts/dev.sh status
```

Los logs de aplicación también quedan en el volumen `backend_writable`.

## 10. Validación de configuración

```bash
./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --dev --runtime
./deploy/scripts/validate.sh --dev --build
```

Comprueba variables obligatorias, formato de URLs y CORS, secretos de ejemplo,
Compose, `.dockerignore`, entorno filtrado del backend y ausencia de secretos
versionados.

## 11. Versionado

La versión se toma del archivo raíz `VERSION` y se incorpora al bundle al
construir el frontend. Después de modificarla, reconstruya el frontend:

```bash
./deploy/scripts/dev.sh build
./deploy/scripts/dev.sh build-frontend
```

No duplique la versión en `package.json`, `composer.json` ni componentes.

## 12. Límites de esta distribución

Este repositorio no incluye:

- Compose de producción ni overrides productivos.
- Traefik, dominios públicos, ACME o certificados TLS.
- Nginx de borde ni plantillas de proxy público.
- Scripts de despliegue, actualización de servidores o publicación.

Cada institución define su propio procedimiento de despliegue a partir del código
fuente y de los requisitos de su infraestructura.
