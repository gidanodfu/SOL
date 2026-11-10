# SOL — Municipalidad Distrital de José Leonardo Ortiz

Sistema de intermediación laboral de la Unidad Funcional del Empleo (Resolución de
Gerencia Municipal N.° 000197-2025-MDJLO-GM): bolsa de empleo pública, registro de
empresas, postulaciones con CV y trazabilidad de contrataciones.

> **Distribución de desarrollo local**
>
> Este repositorio proporciona exclusivamente un entorno de desarrollo local de
> SOL, ejecutado mediante Docker y Docker Compose.
>
> Permite construir, ejecutar, modificar, depurar y probar SOL sin instalar
> dependencias del stack en el sistema anfitrión.
>
> La infraestructura Docker incluida está destinada exclusivamente al desarrollo
> local y no constituye una arquitectura de despliegue productivo.
>
> SOL no prescribe ni proporciona una solución universal de despliegue para
> municipalidades, instituciones, organizaciones o servidores externos.
>
> Cada entidad que adopte el proyecto deberá definir independientemente su
> arquitectura de despliegue, infraestructura, seguridad, almacenamiento, redes,
> dominios, certificados, monitoreo y procedimientos operativos, según sus
> propias necesidades y políticas.
>
> La distribución local no debe utilizarse directamente como configuración de
> producción.

**Versión actual:** `1.5.4` (fuente única: `VERSION`).

## 1. Características principales

- **Autenticación por rol**: empresa con RUC, postulante con DNI, administración
  municipal con usuario/correo; ingreso con Google y recuperación de contraseña.
- **Empresas**: solicitud pública con RUC verificado, aprobación municipal y
  activación mediante enlace de un solo uso; perfil, presencia digital y ofertas.
- **Ofertas laborales**: revisión municipal con estados `pendiente`, `publicada`,
  `observada`, `rechazada` y `cerrada`; vencimiento automático por fecha de cierre.
- **Postulaciones**: CV versionado, historial de estados, retiro voluntario,
  selección por empresa y activación únicamente de postulaciones `seleccionado`.
- **Contrataciones**: situación laboral, fechas validadas y trazabilidad del proceso.
- **Difusión**: actividades y oportunidades externas con estado efectivo calculado
  en `America/Lima` y publicación controlada por el estado administrativo.
- **Administración municipal**: usuarios, empresas, solicitudes, ofertas,
  actividades, oportunidades, contrataciones, dashboards y reportes Excel/PDF.
- **Seguridad**: JWT con refresh rotativo, autorización por rol y propiedad,
  validación de entradas, sanitización HTML, rate limiting, Cloudflare Turnstile
  validado en backend y errores saneados.
- **Interfaz**: React con temas claro/oscuro, editor de texto enriquecido,
  preferencias por usuario y diseño responsive.

## 2. Arquitectura

```
SOL/
├── VERSION                Fuente oficial de la versión del sistema
├── backend/               CodeIgniter 4 — API REST, reglas y autenticación
├── frontend/              React + Vite — SPA
├── tests/                 Pruebas unitarias, smoke y validación de infraestructura
├── docs/                  Requerimientos, matriz, base de datos y operaciones
├── deploy/                Compose de desarrollo y scripts de operación local
├── .env.example           Plantilla única de configuración
└── .github/workflows/     CI de validación y pruebas
```

Servicios locales:

```
Host ──127.0.0.1:5173──▶ frontend (Vite + hot reload)
     ──127.0.0.1:8080──▶ backend (PHP Spark + MySQL)
     ──127.0.0.1:3307──▶ db (MySQL 8)
     ──127.0.0.1:8082──▶ Adminer (perfil opcional "tools")
```

Todo el tráfico queda en la red interna de Docker. No hay proxy público ni TLS
local; el frontend llama directamente a la API configurada en `VITE_API_URL`.

## 3. Tecnologías

| Componente | Versión |
|---|---|
| Backend | CodeIgniter 4.7, PHP 8.4.27 |
| Frontend | React 19, Vite 8, Node.js 22.23.4 |
| Base de datos | MySQL 8.0.46 (driver `MySQLi`) |
| Autenticación | JWT HS256 con refresh tokens rotativos |
| Almacenamiento de CV | Local o Supabase Storage (S3) |
| Contenedores | Docker Engine >= 24, Docker Compose >= 2.24 |

Las imágenes están fijadas en `backend/Dockerfile`, `frontend/Dockerfile` y
`deploy/compose.yaml`. No se usan etiquetas móviles.

## 4. Estructura del repositorio

- `backend/app/Config/Routes.php` — rutas de la API.
- `backend/app/Controllers/` — controladores por rol y públicos.
- `backend/app/Services/` — reglas de negocio.
- `backend/app/Repositories/` — acceso a datos reutilizable.
- `backend/app/Models/` — modelos de CodeIgniter.
- `backend/app/Database/Migrations/` — esquema completo.
- `backend/app/Database/Seeds/` — datos iniciales y fixtures.
- `backend/public/swagger/openapi.yaml` — especificación OpenAPI 3.0.3.
- `frontend/src/pages/` — pantallas por rol.
- `frontend/src/components/`, `services/`, `hooks/`, `contexts/` — UI y estado.
- `docs/` — documentación funcional, de datos y operativa.
- `deploy/scripts/` — automatización local.

## 5. Requisitos

Solo se necesita:

- Git.
- Docker Engine >= 24 o Docker Desktop.
- Docker Compose v2 >= 2.24.

En Windows se recomienda WSL2; los scripts también funcionan desde Git Bash.
No es necesario instalar PHP, Composer, Node.js, npm, MySQL ni ninguna
dependencia de SOL en el host. Todo se ejecuta en contenedores.

## 6. Preparación del entorno

```bash
git clone https://github.com/gidanodfu/SOL.git
cd SOL
cp .env.example .env
chmod 600 .env
```

Edite `.env` y complete al menos:

- `DB_PASSWORD` y `DB_ROOT_PASSWORD` (valores distintos).
- `jwt.secret` y `encryption.key` (claves aleatorias distintas).
- `INITIAL_ADMIN_USERNAME` e `INITIAL_ADMIN_PASSWORD`.

Genere cada clave dentro del contenedor, sin instalar PHP en el host:

```bash
./deploy/scripts/dev.sh run backend php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
```

Ejecútelo dos veces: una para `jwt.secret` y otra para `encryption.key`.

`.env` no se versiona. No comparta ni suba sus credenciales.

## 7. Variables de entorno

| Grupo | Variables |
|---|---|
| Aplicación | `CI_ENVIRONMENT`, `APP_URL`, `app.baseURL`, `app.appTimezone`, `cors.allowedOrigins` |
| Docker local | `COMPOSE_PROJECT_NAME`, `DEV_API_PORT`, `DEV_FRONTEND_PORT`, `DEV_DB_PORT`, `DEV_ADMINER_PORT` |
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DB_DRIVER` |
| Seguridad | `encryption.key`, `jwt.secret`, `jwt.accessExpiresMinutes`, `jwt.refreshExpiresDays`, `INITIAL_ADMIN_*` |
| Almacenamiento | `storage.driver`, `storage.bucket`, `s3.*` |
| Rate limiting de CV | `cvRateLimit.*` |
| Servicios externos | `sunat.token`, `jsonpe.token`, `RESEND_*`, `email.*`, `google.clientId`, `turnstile.*` |
| Frontend público | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_TURNSTILE_SITE_KEY` |

El backend consume un archivo filtrado, `deploy/runtime/backend.env`, generado
automáticamente por los scripts. No lo edite ni lo versione.

## 8. Inicio rápido

```bash
# 1. Construir imágenes e iniciar servicios
./deploy/scripts/dev.sh up

# 2. Reinstalar dependencias desde los lockfiles (opcional al inicio o tras
#    cambiar composer.lock / package-lock.json)
./deploy/scripts/dev.sh deps

# 3. Inicializar base de datos, migraciones y administrador
./deploy/scripts/bootstrap.sh --dev --authorize
```

El primer `up` ya instala Composer y npm dentro de las imágenes. `deps`
reconstruye esas capas cuando cambian los lockfiles; nunca ejecute
`composer install` ni `npm install` en el host.

Accesos:

- Frontend: <http://localhost:5173>
- API: <http://localhost:8080>
- MySQL: `127.0.0.1:3307`
- Adminer opcional: <http://localhost:8082> (`./deploy/scripts/dev.sh tools`)

## 9. Base de datos, migraciones y seeds

El esquema se crea exclusivamente con migraciones. Para una instalación nueva:

```bash
./deploy/scripts/bootstrap.sh --dev --authorize
```

Ese comando aplica todas las migraciones, ejecuta `SystemSeeder` una sola vez y
crea el administrador inicial. Se niega a continuar si la base ya contiene
usuarios.

Para un entorno ya migrado:

```bash
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh migration-status
```

Fixtures de prueba (con confirmación explícita):

```bash
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
./deploy/scripts/dev.sh seed DatosMasivosSeeder --yes
```

El catálogo de tablas, relaciones y orden de migraciones está en
[`docs/base-datos.md`](docs/base-datos.md).

## 10. Acceso a la aplicación

1. Abra <http://localhost:5173>.
2. Inicie sesión con el administrador definido en `.env`.
3. Cree empresas desde el flujo público o la administración municipal.
4. Registre postulantes y cargue un CV para probar la postulación.

La API responde en <http://localhost:8080>; `GET /health` permite comprobar
disponibilidad.

### Conexión a MySQL desde DBeaver

| Campo | Valor |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `DEV_DB_PORT` (por defecto `3307`) |
| Base de datos | `DB_DATABASE` |
| Usuario | `DB_USER` |
| Contraseña | `DB_PASSWORD` |

Si DBeaver muestra un error de autenticación, agregue en **Driver properties**:

```text
allowPublicKeyRetrieval = true
useSSL = false
```

Luego use **Test Connection**. También puede abrir el cliente dentro del
contenedor con `./deploy/scripts/dev.sh db`.

## 11. Comandos útiles

```bash
./deploy/scripts/dev.sh up                 # iniciar (construye si hace falta)
./deploy/scripts/dev.sh up --no-build      # iniciar sin reconstruir
./deploy/scripts/dev.sh restart            # reiniciar servicios
./deploy/scripts/dev.sh down               # detener (conserva volúmenes)
./deploy/scripts/dev.sh build              # reconstruir imágenes
./deploy/scripts/dev.sh deps               # reinstalar Composer/npm desde lockfiles
./deploy/scripts/dev.sh build-frontend     # build de producción del frontend
./deploy/scripts/dev.sh cache              # limpiar caché de CodeIgniter
./deploy/scripts/dev.sh status             # estado y salud
./deploy/scripts/dev.sh logs [servicio]    # logs
./deploy/scripts/dev.sh shell [servicio]   # shell interactiva
./deploy/scripts/dev.sh exec <svc> <cmd>   # comando puntual
./deploy/scripts/dev.sh run <svc> <cmd>    # contenedor temporal
./deploy/scripts/dev.sh db                 # cliente MySQL
./deploy/scripts/dev.sh tools              # Adminer
./deploy/scripts/dev.sh migrate            # migraciones pendientes
./deploy/scripts/dev.sh migration-status   # estado de migraciones
./deploy/scripts/dev.sh seed <seeder> --yes
./deploy/scripts/dev.sh validate           # validar configuración
./deploy/scripts/dev.sh test [objetivo]    # pruebas
```

Las herramientas viven dentro de los contenedores; puede comprobarlo sin
instalar nada en el host:

```bash
./deploy/scripts/dev.sh exec backend php -v
./deploy/scripts/dev.sh exec backend composer --version
./deploy/scripts/dev.sh exec frontend node -v
./deploy/scripts/dev.sh exec frontend npm -v
./deploy/scripts/dev.sh exec db mysql --version
```

Validación y respaldos:

```bash
./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --dev --runtime
./deploy/scripts/backup.sh dev
./deploy/scripts/restore.sh --env dev --db <archivo.sql> --confirm "RESTORE:<proyecto>:dev"
```

## 12. Pruebas

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP contra el stack activo
./deploy/scripts/test.sh smoke      # integración aislada en MySQL temporal
./deploy/scripts/test.sh validation # validación de variables y contexto Docker
```

El detalle de suites y responsabilidades está en [`tests/README.md`](tests/README.md).

## 13. Persistencia y respaldos locales

Volúmenes nombrados:

- `sol_dev_mysql_data` — datos de MySQL.
- `sol_dev_backend_writable` — caché, logs y archivos de escritura del backend.

`dev.sh down` no elimina volúmenes. Para respaldar antes de una migración o
restauración:

```bash
./deploy/scripts/backup.sh dev
```

El respaldo se guarda por defecto en `$HOME/sol-backups`, fuera del repositorio,
con manifiesto y SHA-256. La restauración es destructiva y exige confirmación
explícita. Nunca ejecute `docker compose down -v`, `docker volume prune` ni
`docker volume rm` sobre estos volúmenes.

Si usa Supabase para CV, respalde también el bucket desde el proveedor.

## 14. Solución de problemas

| Síntoma | Comprobación |
|---|---|
| `Falta .env` | `cp .env.example .env` y completar valores. |
| Puerto ocupado | Cambiar `DEV_API_PORT`, `DEV_FRONTEND_PORT` o `DEV_DB_PORT` en `.env` y actualizar `app.baseURL`/`VITE_API_URL`/`cors.allowedOrigins` si corresponde. |
| Backend no healthy | `./deploy/scripts/dev.sh logs backend`; verificar credenciales de MySQL. |
| Migraciones pendientes | `./deploy/scripts/dev.sh migrate`. |
| Base con datos inesperados | Revisar `./deploy/scripts/dev.sh db` y los respaldos locales. |
| Frontend sin API | Confirmar `VITE_API_URL` y `cors.allowedOrigins`. |
| Configuración inválida | `./deploy/scripts/validate.sh --dev`. |

Para reiniciar desde cero **sin borrar datos**, use `dev.sh restart`. Si realmente
necesita una base limpia, respalde primero y restaure solo en un entorno local.

## 15. Seguridad en desarrollo

- `.env` y `deploy/runtime/` están fuera de Git y de las imágenes.
- El backend nunca recibe `DB_ROOT_PASSWORD`, credenciales iniciales ni variables
  `VITE_*`; el frontend solo recibe variables públicas `VITE_*`.
- Los errores `500` no exponen detalles internos.
- Las validaciones y autorizaciones se ejecutan en el backend; las del frontend
  son solo de presentación.
- No use credenciales reales de producción en este entorno local.

## 16. Versionado

`VERSION` es la única fuente de la versión del sistema. `frontend/vite.config.js`
la lee, valida el formato e inyecta `VITE_SOL_VERSION`; `/about` la muestra.
`frontend/package.json` permanece en `0.0.0` y `backend/composer.json` no declara
versión de aplicación: no duplique la versión en esos archivos.

El historial de cambios está en [`CHANGELOG.md`](CHANGELOG.md).

## 17. Documentación

- [`docs/requerimientos.md`](docs/requerimientos.md) — requisitos y reglas de negocio.
- [`docs/matriz-cumplimiento.md`](docs/matriz-cumplimiento.md) — trazabilidad RF/RN/RT.
- [`docs/base-datos.md`](docs/base-datos.md) — esquema, relaciones y migraciones.
- [`docs/operaciones.md`](docs/operaciones.md) — operación del entorno local.
- [`docs/identidad-conflictos.md`](docs/identidad-conflictos.md) — diagnóstico histórico de identidad.
- [`backend/README.md`](backend/README.md) — arquitectura de la API.
- [`frontend/README.md`](frontend/README.md) — arquitectura React.
- [`deploy/README.md`](deploy/README.md) — Docker, Compose y scripts locales.
- [`tests/README.md`](tests/README.md) — pruebas y QA.
- [`backend/docs/auditoria-backend.md`](backend/docs/auditoria-backend.md) — auditoría histórica.
- [`CHANGELOG.md`](CHANGELOG.md) — registro de versiones.

## Autores y licencia

Proyecto desarrollado para la Municipalidad Distrital de José Leonardo Ortiz.
Licencia MIT; consulte [`LICENSE`](LICENSE).