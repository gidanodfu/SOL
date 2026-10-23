# Backend — API Sistema de Empleo (CodeIgniter 4)

API REST de intermediación laboral MDJLO. Guía rápida; el contexto completo del proyecto
está en el [`README.md`](../README.md) de la raíz.

## Stack

- CodeIgniter 4.7 · PHP 8.4.27 (imagen fijada `php:8.4.27-fpm-alpine3.23`) · MySQL 8.0.46 (MySQLi, `numberNative=true`)
- JWT HS256 (`firebase/php-jwt`) con refresh rotativo · Supabase Storage (S3) para CV

## Estructura

```
app/
├── Config/            rutas (Routes.php), filtros, CORS, Database…
├── Controllers/Api/   endpoints por rol (Admin/, Empresa/, Postulante/) y públicos
├── Services/          reglas de negocio (Auth, SolicitudEmpresa, Oferta, Postulacion…)
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

En producción se usa PHP-FPM dentro de `deploy/compose.prod.yaml`; el
despliegue se realiza con `./deploy/scripts/deploy.sh`. No ejecute `php spark`,
Composer ni MySQL en el host. El bootstrap inicial está en
`./deploy/scripts/bootstrap.sh` (exige `--authorize`) y las operaciones en
`docs/operaciones.md`.

## Convenciones

- Respuestas: `{success, message, data, errors}`.
- Errores: `ApiException` → `400/401/403/404/409/422/429/500` con cuerpo uniforme. Los
  errores no controlados (`500`) responden un mensaje genérico y se registran en el log;
  nunca exponen SQL, rutas ni stack traces.
- Rate limiting: Throttler nativo de CI4 (token bucket: ráfaga inicial + 1 token por
  intervalo) en login (5 tokens/300 s por IP+usuario, solo fallos), refresh/Google/registro
  (10/300 s por IP) y subida de CV (10/3600 s por IP). Responde `429` con `Retry-After`
  (≈ intervalo), no un bloqueo fijo de 5 min.
- Validación: `telefono` exige 9 u 11 dígitos (`^(?:\d{9}|\d{11})$`); el backend es la
  validación definitiva.
- Conexión MySQL: gestión nativa de CI4 (`db_connect()` comparte una conexión por
  request); no hay pool personalizado.
- Capas: los controllers son delgados; el negocio vive en `Services`; el acceso a datos en
  `Repositories`/`Models`.
- Endpoints públicos: login/refresh, registro de postulante, `auth/google`,
  `verificar-ruc`, `solicitudes-empresa`, `activar-cuenta/{token}`, `ofertas` (bolsa
  pública), `categorias`, `oportunidades`, `actividades`. El resto exige `jwt` + `rol`.
- No hay DELETE físico para entidades de negocio: se desactivan (excepto CV y archivos).

## Documentación de la API

- `public/swagger/openapi.yaml` — especificación OpenAPI 3.0.3 completa (81 operaciones,
  versión 1.1.0). Incluye rate limits (`429`), límite mensual de CV, validación de
  teléfono y respuestas de error saneadas. Abrir `public/swagger/index.html` (Swagger UI
  por CDN).
- `docs/auditoria-backend.md` — auditoría de seguridad/calidad con nota de vigencia y
  sección "Actualización post-correcciones (2026-09-10)".
- `docs/_validate_openapi.py` — validador opcional; requiere PyYAML y debe ejecutarse
  en un contenedor de herramientas, no como dependencia del host. No forma parte del
  flujo oficial de build.

## Pruebas

```bash
./deploy/scripts/test.sh backend
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit tests/unit/ValidadorTest.php
```

Las pruebas de integración profundas de `../tests/smoke/` son legado y requieren
un entorno aislado; consulte `../tests/README.md`. No las ejecute contra
desarrollo o producción.
