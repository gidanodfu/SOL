# Operaciones de SOL (desarrollo local)

> Documentación operativa sincronizada con SOL **1.4.8**. Describe únicamente el
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
| Google/Turnstile | `google.clientId`, `turnstile.*`, `VITE_*` |
| Rate limiting de CV | `cvRateLimit.*` |

No incluya secretos en Git. `deploy/runtime/backend.env` se genera con permisos
`600` y contiene solo las variables que el backend necesita.

## 2. Arranque

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
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
