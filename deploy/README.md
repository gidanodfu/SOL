# Deploy — entorno local de SOL

Docker es la única vía oficial para desarrollar SOL. Este directorio contiene el
stack de desarrollo, los scripts de operación local y la configuración filtrada
del backend. No incluye infraestructura ni procedimientos de producción.

## 1. Estructura

```
deploy/
├── compose.yaml          Stack único de desarrollo (db, backend, frontend, Adminer)
├── e2e/Dockerfile        Imagen de pruebas con Chromium Headless Shell
├── scripts/
│   ├── dev.sh            Inicio, parada, logs, shell, migraciones y seeds
│   ├── bootstrap.sh      Instalación inicial con SystemSeeder
│   ├── test.sh           Pruebas backend, frontend, HTTP, smoke, E2E y validación
│   ├── validate.sh       Validación de .env, Compose y scripts
│   ├── smoke.sh          Smoke aislado en MariaDB temporal
│   ├── e2e.sh            Chromium Headless Shell (imagen propia, fuera del repo)
│   ├── backup.sh         Respaldo local de MariaDB y writable
│   ├── restore.sh        Restauración local con confirmación explícita
│   └── lib/common.sh     Utilidades compartidas
└── runtime/              backend.env generado (ignorado por Git)
```

## 2. Requisitos

- Docker Engine >= 24 o Docker Desktop.
- Docker Compose v2 >= 2.24.
- Git.

No se requiere PHP, Composer, Node.js, npm ni MariaDB en el host. En Windows
use WSL2 o Git Bash para ejecutar los scripts. No existe Makefile ni flujo
alternativo que instale herramientas en el sistema operativo.

## 3. Configuración

Desde la raíz del repositorio:

```bash
cp .env.example .env
chmod 600 .env
```

Complete en `.env`:

- `DB_PASSWORD` y `DB_ROOT_PASSWORD` distintos.
- `jwt.secret` y `encryption.key` aleatorios y distintos.
- `INITIAL_ADMIN_USERNAME` e `INITIAL_ADMIN_PASSWORD`.

`.env.example` es la única plantilla versionada. `.env` no se versiona.

## 4. Servicios

| Servicio | Imagen / build | Puerto local | Función |
|---|---|---|---|
| `db` | `mariadb:11.4.13` | `127.0.0.1:3307` | MariaDB con volumen persistente |
| `backend` | `backend/Dockerfile` target `dev` | `127.0.0.1:8080` | API CodeIgniter con recarga de código |
| `frontend` | `frontend/Dockerfile` target `dev` | `127.0.0.1:5173` | Vite con hot reload |
| `adminer` | `adminer:5.3.0` | `127.0.0.1:8082` | Perfil opcional `tools` |

Todos los puertos se publican solo en `127.0.0.1`. La red `internal` es privada
del proyecto Compose.

## 5. Dependencias

Composer y npm se ejecutan durante la construcción de las imágenes:

- `backend/composer.lock` → `vendor/` dentro de la imagen backend.
- `frontend/package-lock.json` → `node_modules/` dentro de la imagen frontend.

No se montan `vendor/` ni `node_modules/` del host. Si cambia un lockfile:

```bash
./deploy/scripts/dev.sh deps
```

Ese comando reconstruye las capas de dependencias. Para ejecutar herramientas
puntuales use `dev.sh exec` o `dev.sh run`; nunca las instale en el host.

## 6. Inicio y operación

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh deps       # reinstalar desde composer.lock / package-lock.json
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh down      # conserva volúmenes
```

Para una instalación nueva:

```bash
./deploy/scripts/bootstrap.sh --dev --authorize
```

Este comando crea el esquema, ejecuta `SystemSeeder` y verifica el administrador
inicial. No se ejecuta desde `up` ni `restart`.

Actualización de un entorno existente:

```bash
./deploy/scripts/dev.sh migrate
```

## 7. Volúmenes y persistencia

| Volumen | Contenido |
|---|---|
| `sol_dev_mariadb_data` | Bases y tablas de MariaDB |
| `sol_dev_mysql_data` | Volumen histórico de MySQL; se conserva intacto y no se reutiliza |
| `sol_dev_backend_writable` | Caché, logs y archivos de escritura del backend |

`dev.sh down` y `restore.sh` no eliminan volúmenes. Está prohibido ejecutar
`docker compose down -v`, `docker volume prune`, `docker system prune --volumes`
o `docker volume rm` sobre estos volúmenes.

## 8. Respaldos y restauración

```bash
./deploy/scripts/backup.sh dev
```

Genera un dump de MariaDB y un tar del volumen `writable` en `$HOME/sol-backups`
(configurable con `BACKUP_DIR`), fuera del repositorio, con permisos `600`,
manifiesto y SHA-256.

Restauración destructiva y explícita:

```bash
./deploy/scripts/restore.sh \
  --env dev \
  --db "$HOME/sol-backups/sol-db-<fecha>.sql" \
  [--files "$HOME/sol-backups/sol-writable-<fecha>.tar.gz"] \
  --confirm "RESTORE:sol_dev:dev"
```

Antes de restaurar se crea un respaldo de seguridad. Al final se verifican las
tablas, la tabla `users` y el acceso HTTP.

## 9. Migraciones y seeds

```bash
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
./deploy/scripts/dev.sh seed DatosMasivosSeeder --yes
```

`SystemSeeder` solo se ejecuta desde `bootstrap.sh` con `--authorize`. Las
migraciones son la única fuente del esquema; no se editan migraciones históricas.

## 10. Validación y pruebas

```bash
./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --dev --runtime
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh http
./deploy/scripts/test.sh smoke
./deploy/scripts/test.sh e2e
./deploy/scripts/test.sh audit
./deploy/scripts/test.sh compatibility
./deploy/scripts/test.sh php-lint
./deploy/scripts/test.sh validation
```

`validate.sh` comprueba variables, scripts, Compose, variables filtradas del
backend, `.dockerignore` y ausencia de secretos versionados. No imprime valores
privados.

## 11. Entorno filtrado del backend

Los scripts generan `deploy/runtime/backend.env` con permisos `600`, ignorado por
Git y por Docker. El contenedor backend solo recibe las variables que necesita:
aplicación, base de datos, JWT, almacenamiento, correo, Google, Turnstile,
rate limiting y servicios externos. No recibe `DB_ROOT_PASSWORD`, credenciales
iniciales ni variables `VITE_*`.

No edite ese archivo a mano. Si invoca Compose manualmente después de ejecutar un
script, exporte `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"`.

## 12. Actualizar versiones de imágenes

Las versiones están fijadas y no se usa `latest`.

1. Revisar compatibilidad con CodeIgniter/React.
2. Cambiar la etiqueta exacta en el Dockerfile o en `compose.yaml`.
3. Ejecutar `./deploy/scripts/validate.sh --dev --build`.
4. Ejecutar `./deploy/scripts/test.sh all`.

Estas versiones son de infraestructura, no la versión de la aplicación. La
versión de SOL vive únicamente en `VERSION` y se inyecta al compilar el frontend.

## 13. Diagnóstico

```bash
docker compose -p sol_dev ps
docker compose -p sol_dev logs --tail=100 backend
docker network inspect sol_dev_internal
docker volume inspect sol_dev_mariadb_data
```

Para problemas frecuentes consulte la sección correspondiente del
[`README.md`](../README.md).
