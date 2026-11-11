# Backend — API Sistema de Empleo (CodeIgniter 4)

API REST de intermediación laboral MDJLO. Guía rápida; el contexto completo del proyecto
está en el [`README.md`](../README.md) de la raíz.

## Stack

- CodeIgniter 4.7 · PHP 8.4.27 (imagen fijada `php:8.4.27-fpm-alpine3.23`) · MariaDB 11.4.13 LTS (driver MySQLi, `numberNative=true`)
- JWT HS256 (`firebase/php-jwt`) con refresh rotativo · Supabase Storage (S3) para CV

## Estructura

```
app/
├── Config/            rutas (Routes.php), filtros, CORS, Database…
├── Controllers/Api/   endpoints por rol (Admin/, Empresa/, Postulante/) y públicos
├── Services/          reglas de negocio (Auth, SolicitudEmpresa, Oferta, Postulacion,
│                      CvService, CvRateLimiter…)
├── Repositories/      acceso a datos reutilizable
├── Models/            modelos Eloquent-style de CodeIgniter
├── Database/Migrations/  esquema completo (usuarios→solicitudes/activaciones/proveedor)
├── Database/Seeds/    SystemSeeder (admin inicial + categorías), DatosPruebaSeeder
│                      (fixtures de tests) y DatosMasivosSeeder (carga masiva ficticia)
├── Filters/           JwtAuthFilter, RoleFilter y ThrottleFilter (rate limiting)
└── Validation/        Validador (reglas reutilizables: ruc, dni, telefono, enum, fechas…)
```

## Puesta en marcha

La configuración es única y vive en el `.env` de la raíz del repositorio
(CodeIgniter carga esa ruta mediante `Config\Paths::$envDirectory`). El backend
se ejecuta siempre dentro de Docker.

```bash
# desde la raíz
cp .env.example .env
chmod 600 .env
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh deps                     # tras cambiar composer.lock
./deploy/scripts/dev.sh migrate
./deploy/scripts/bootstrap.sh --dev --authorize   # solo instalación nueva
```

Para operar el backend:

```bash
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh shell backend
./deploy/scripts/dev.sh exec backend php spark routes
./deploy/scripts/dev.sh exec backend php spark migrate:status
./deploy/scripts/dev.sh down                  # conserva volúmenes
```

El backend se ejecuta en el contenedor de desarrollo con el servidor integrado
de CodeIgniter. No ejecute `php spark`, Composer ni MariaDB en el host. El bootstrap
inicial está en `./deploy/scripts/bootstrap.sh` (exige `--authorize`) y las
operaciones en `docs/operaciones.md`.

## Convenciones

- Respuestas: `{success, message, data, errors}`.
- Errores: `ApiException` → `400/401/403/404/409/422/429/500` con cuerpo uniforme. Los
  errores no controlados (`500`) responden un mensaje genérico y se registran en el log;
  nunca exponen SQL, rutas ni stack traces.
- Rate limiting: Throttler nativo de CI4 (token bucket: ráfaga inicial + 1 token por
  intervalo) en login (5 tokens/300 s por IP+usuario, solo fallos),
  refresh/Google/registro/verificación de DNI (10/300 s por IP) y
  verificar-RUC/solicitudes-empresa (5/300 s por IP). La subida de CV usa
  `CvRateLimiter` con ventanas fijas persistidas en `rate_limit_contadores`:
  por defecto 5/10 min y 20/hora por usuario, 10/10 min y 40/hora por IP
  (`cvRateLimit.*`), más una carga simultánea por postulante con `GET_LOCK`.
  Responde `429` con `Retry-After`. No existe cuota mensual de CV.
- Validación: `telefono` exige 9 u 11 dígitos (`^(?:\d{9}|\d{11})$`); el backend es la
  validación definitiva.
- Conexión MariaDB (driver `MySQLi`): gestión nativa de CI4 (`db_connect()` comparte una conexión por
  request); no hay pool personalizado.
- Capas: los controllers son delgados; el negocio vive en `Services`; el acceso a datos en
  `Repositories`/`Models`.
- Endpoints públicos: login/refresh, registro de postulante, `auth/google`,
  `verificar-ruc`, `solicitudes-empresa`, `activar-cuenta/{token}`, `ofertas` (bolsa
  pública), `categorias`, `oportunidades`, `actividades`. El resto exige `jwt` + `rol`.
- No hay DELETE físico para entidades de negocio: se desactivan (excepto CV y archivos).

## Integraciones externas

- **DNI/RUC**: APIsPERU es el proveedor único. `ApisperuClient` centraliza la
  autenticación Bearer, el transporte y los errores; `DniService` y `RucService`
  adaptan la respuesta a los contratos internos. La configuración
  (`apisperu.baseURL`, `apisperu.token`, `apisperu.timeout`) es exclusiva del
  backend. Ver `docs/integraciones/apisperu.md`.
- **Correo**: Resend con respaldo SMTP (`RESEND_*`, `email.*`).
- **Google**: verificación del `id_token` (`google.clientId`).
- **Cloudflare Turnstile**: validación server-side (`turnstile.*`).

## Base de datos, migraciones y almacenamiento

- Esquema MariaDB 11.4, tablas InnoDB y migraciones en `app/Database/Migrations/`.
  El catálogo de tablas, relaciones y orden de migraciones está en
  [`../docs/base-datos.md`](../docs/base-datos.md).
- `spark migrate` aplica migraciones pendientes; `bootstrap.sh` es el único
  procedimiento autorizado para una instalación nueva con `SystemSeeder`.
  Para actualizar un entorno existente use `dev.sh migrate`.
- `SystemSeeder` crea el administrador inicial y categorías; `DatosPruebaSeeder`
  y `DatosMasivosSeeder` son fixtures y no forman parte del runtime.
- Los CV se guardan como archivo en Storage (driver `local` o `supabase`) y
  metadatos en `cvs`; `cv_activos` garantiza un único CV vigente. Si falla la
  transacción se compensa el archivo almacenado.
- Las descargas de CV y documentos privados se autorizan en el backend; nunca
  se exponen claves internas ni URLs públicas permanentes.

## Documentación de la API

- `public/swagger/openapi.yaml` — especificación OpenAPI 3.0.3 completa (89 rutas /
  107 operaciones, versión 1.5.4). Incluye rate limits (`429`), rate limiting
  configurable de CV, validación de teléfono y respuestas de error saneadas.
  Abrir `public/swagger/index.html` (Swagger UI por CDN).
- `docs/auditoria-backend.md` — auditoría de seguridad/calidad con nota de vigencia y
  sección "Actualización post-correcciones (2026-09-10)".
- `docs/_validate_openapi.py` — validador opcional; requiere PyYAML y debe ejecutarse
  en un contenedor de herramientas, no como dependencia del host. No forma parte del
  flujo oficial de build.

## Utilidades heredadas

`backend/builds` y los validadores `docs/_validate_openapi.py` /
`public/swagger/_validate_openapi.py` son utilidades heredadas de CodeIgniter y
de la documentación. No forman parte del runtime, del build ni del flujo
oficial; si se necesitan, ejecútelos en un contenedor de herramientas temporal.
No son requisitos del host.

## Pruebas

```bash
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh smoke
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit tests/unit/ValidadorTest.php
```

`test.sh smoke` ejecuta los scripts de integración en un MariaDB temporal dentro
de Docker; no usa PHP, Python ni MariaDB del host. Consulte `../tests/README.md`.

Para la carga masiva opcional de CV ficticios (requiere `DatosMasivosSeeder` y el
backend de desarrollo activo):

```bash
./backend/scripts/seed_cvs_masivos.sh
```

El script usa una imagen de herramientas temporal y el volumen de `writable`;
no requiere Python, curl ni PHP en el host.
