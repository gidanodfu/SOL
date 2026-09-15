# Sistema de Empleo — Municipalidad Distrital de José Leonardo Ortiz

## 1. Descripción

Sistema web de intermediación laboral de la Unidad Funcional del Empleo (Resolución de
Gerencia Municipal N.° 000197-2025-MDJLO-GM): bolsa de empleo pública, auto-registro de
empresas con aprobación municipal, postulaciones con CV y trazabilidad de la contratación.
La especificación funcional está en `docs/requerimientos.md` y la trazabilidad RF/RN/RT en
`docs/matriz-cumplimiento.md`.

## 2. Arquitectura

```
SISTEMA-EMPLEO/
├── backend/               CodeIgniter 4 (PHP 8.2+) — API REST, reglas de negocio, auth
├── frontend/              React + Vite — presentación y consumo de API
├── tests/smoke/           Pruebas de integración de la API (curl)
├── docs/                  Requerimientos y matriz de cumplimiento RF/RN/RT
└── docker-compose.yml     MySQL 8 + Adminer (desarrollo local)
```

```
React ──HTTP──▶ CodeIgniter API ──▶ MySQL        (fuente de verdad)
                     └────────────▶ Supabase Storage (CV, S3-compatible)
```

Principio rector: **frontend y backend son proyectos independientes**. React es solo
presentación; CodeIgniter maneja negocio, autenticación, autorización y acceso a datos;
MySQL es la fuente de verdad.

### Funcionalidades principales

- **Roles**: `admin` (municipal), `empresa`, `postulante`. El rol vive en `users.rol`
  (ENUM); no existe tabla de roles. Auth JWT + refresh, filtros `jwt` y `rol:` por ruta;
  bloqueo inmediato al desactivar la cuenta.
- **Auto-registro de empresas**: solicitud pública con RUC verificado en SUNAT
  (`sunat.token`); el admin aprueba/rechaza desde una bandeja y la cuenta se activa con un
  enlace de un solo uso (`/activar-cuenta`). El login usa el correo corporativo (el RUC
  también funciona).
- **Ofertas laborales**: la empresa guarda borradores y las publica directamente; el admin
  supervisa y puede cerrarlas. Estados: `borrador → publicada → cerrada`.
- **Bolsa de empleo pública**: `/postulante/buscar` y las ofertas se consultan sin sesión;
  postular requiere cuenta de postulante.
- **Postulantes**: registro manual con auto-login (DNI) o ingreso con Google; perfil =
  datos personales/contacto + **CV** (obligatorio para postular). El CV se versiona y
  admite hasta 4 cargas por mes calendario; la interfaz muestra el consumo y el botón
  cambia de "Subir CV" a "Actualizar CV".
- **Validación de teléfono**: 9 u 11 dígitos (`^(?:\d{9}|\d{11})$`), validado en backend y
  en frontend.
- **Rate limiting** (token bucket de CI4): login 5 fallos por IP+usuario y 1 intento/60 s
  después; refresh/Google/registro 10 por IP y 1/30 s; subida de CV 10 por IP y 1/6 min.
  Responde `429` con `Retry-After`.
- **Errores seguros**: sobre uniforme `{success, message, data, errors}`; los `500`
  devuelven un mensaje genérico y el detalle solo queda en el log. El hash de contraseña
  nunca se expone en la API.
- Nada se borra físicamente: activo/inactivo + historial (auditoría, `postulacion_historial`).

## 3. Requisitos

- PHP >= 8.2 con extensiones `curl`, `fileinfo`, `mysqli` (ver §17) · Composer 2
- MySQL 8 (o MariaDB compatible)
- Node.js >= 20 y npm
- Docker (opcional, para MySQL + Adminer local)

## 4. Instalación

### Clonar el repositorio

```bash
git clone https://github.com/gidanodfu/SOL.git
cd SOL
```

### Base de datos (Docker, opcional si ya tienes MySQL 8)

```bash
docker compose up -d            # MySQL en :3306 (db: sistema_empleo, user: empleo/empleo123)
                                # Adminer en http://localhost:8082
```

### Backend

```bash
cd backend
composer install
cp .env.example .env            # ajustar DB; opcionales: Supabase, SUNAT, SMTP, Google
# editar .env con los datos de conexión (database.default.*) y INITIAL_ADMIN_*
php spark migrate               # crea/actualiza el esquema completo
php spark db:seed SystemSeeder  # datos iniciales (administrador y categorías)
php spark serve                 # API en http://localhost:8080
```

### Datos ficticios (solo desarrollo/pruebas)

Los datos de prueba están **separados** de la instalación inicial. `SystemSeeder` no crea
empresas, postulantes, ofertas ni credenciales ficticias. Para cargarlos:

```bash
cd backend
php spark db:seed DatosPruebaSeeder   # fixtures para tests/smoke (no usar en producción)
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env            # VITE_API_URL=http://localhost:8080
npm run dev                     # http://localhost:5173 (origen permitido por CORS)
```

## 5. Configuración .env

### Backend (`backend/.env`)

| Variable | Uso |
|---|---|
| `CI_ENVIRONMENT` | `development` o `production` |
| `app.baseURL` | URL pública del backend (p. ej. `http://localhost:8080/`) |
| `app.frontendUrl` | Base del frontend para los enlaces de activación |
| `database.default.hostname` / `database` / `username` / `password` / `port` | Conexión MySQL |
| `database.default.DBDriver` | `MySQLi` (valor por defecto del proyecto) |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | Cuenta administradora que crea `SystemSeeder` |
| `jwt.secret` | Clave para firmar JWT (larga y aleatoria; rotar en producción) |
| `jwt.accessExpiresMinutes` / `jwt.refreshExpiresDays` | Duraciones de sesión |
| `storage.driver` | `local` (desarrollo) o `supabase` (producción) |
| `storage.bucket` / `s3.endpoint` / `s3.accessKey` / `s3.secretKey` / `s3.region` | Supabase Storage (CV) |
| `sunat.token` | Verificación de RUC en el auto-registro (opcional) |
| `email.*` | SMTP para notificaciones (opcional; vacío = no envía) |
| `google.clientId` | Ingreso con Google (opcional) |
| `activacion.expiraDias` | Vigencia del enlace de activación (7) |
| `cors.allowedOrigins` | Origen(es) permitidos del frontend en producción |

El `.env` real **no se versiona**. En `backend/.env.example` las credenciales van vacías
salvo el usuario inicial; nunca se escribe una contraseña real en un archivo versionado.

### Frontend (`frontend/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | Base del backend, p. ej. `http://localhost:8080` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth de Google (habilita el botón de Google) |

## 6. Base de datos

- Motor: **MySQL 8** con driver `MySQLi`; collation `utf8mb4_general_ci`.
- Conexión: se usa la gestión nativa de CodeIgniter 4 (`db_connect()` / `Database::connect()`
  comparten una única conexión por request); **no** se implementó un pool personalizado.
- El esquema se crea exclusivamente con migraciones; los seeds solo insertan datos.

## 7. Migraciones

Las migraciones viven en `backend/app/Database/Migrations/` y son las responsables de
crear/actualizar **toda** la estructura: tablas, columnas, índices, claves foráneas y
restricciones.

```bash
cd backend
php spark migrate            # ejecuta todas las migraciones pendientes y crea/actualiza el esquema completo
php spark migrate:status     # muestra las migraciones ejecutadas y pendientes
```

Tablas principales del esquema: `users`, `user_refresh_tokens`, `auditoria`, `empresas`,
`postulantes`, `cvs`, `categorias`, `ofertas`, `ofertas_habilidades`, `postulaciones`,
`postulacion_historial`, `solicitudes_empresa`, `activaciones`, `actividades`,
`oportunidades`, `contrataciones`, entre otras. Las tablas de perfil retiradas
(`formacion_academica`, `experiencia_laboral`, `habilidades`, `cursos_certificaciones`) y
`atenciones` siguen creadas por las migraciones históricas pero ya no se usan; pueden
eliminarse con una migración cuando se confirme que ningún entorno tiene datos reales.

> No hay un número fijo de migraciones: `php spark migrate` siempre aplica las pendientes.
> Las migraciones **no** insertan datos ni credenciales.

## 8. Seeds

Ubicados en `backend/app/Database/Seeds/`:

| Seeder | Contenido | Entorno |
|---|---|---|
| `SystemSeeder` | Administrador inicial (desde `INITIAL_ADMIN_*`) y categorías de referencia. **Idempotente**: no duplica si ya existen. | Inicial (producción y desarrollo) |
| `DatosPruebaSeeder` | Fixtures de los smoke tests: admin/empresa/postulante de prueba, una oferta publicada y una postulación con historial. Idempotente. | Solo pruebas |
| `DatosMasivosSeeder` | Carga masiva ficticia (empresas, postulantes, ofertas, postulaciones y contrataciones). | Solo pruebas |

```bash
cd backend
php spark db:seed SystemSeeder        # requerido en la instalación inicial
php spark db:seed DatosPruebaSeeder   # opcional: fixtures para tests/smoke
```

> `SystemSeeder` y los seeds de prueba están separados a propósito: la instalación inicial
> no carga empresas, postulantes ni credenciales ficticias.

## 9. Usuario administrador inicial

La instalación inicial (`php spark migrate` + `php spark db:seed SystemSeeder`) deja **una
única cuenta administradora**, provisionada desde el `.env`:

| Usuario | Contraseña inicial | Rol |
|---|---|---|
| `MDJLO-SOL` | `MDJLO.2026` | `admin` |

- La contraseña se lee de `INITIAL_ADMIN_PASSWORD` y se guarda **con hash**
  (`password_hash(PASSWORD_DEFAULT)`); nunca se escribe en migraciones ni en código.
- Si `INITIAL_ADMIN_PASSWORD` está vacío, `SystemSeeder` no crea la cuenta e indica cómo
  configurarla.
- **Cambie la contraseña después del primer acceso** (Mi cuenta → contraseña).
- Las demás cuentas (`empresa`, `postulante`) se crean por sus flujos reales
  (auto-registro/activación y registro público). Los roles `empresa` y `postulante` se
  mantienen.

## 10. Ejecución backend

```bash
cd backend
php spark serve              # API en http://localhost:8080 (puerto por defecto del proyecto)
```

El puerto se controla con `php spark serve --port <puerto>`; si se cambia, ajustar
`app.baseURL` en `backend/.env` y `VITE_API_URL` en `frontend/.env`.

## 11. Ejecución frontend

```bash
cd frontend
npm run dev                  # http://localhost:5173 (puerto fijo en vite.config.js)
npm run build                # producción → dist/
npm run lint                 # oxlint
npm run preview              # sirve dist/
```

El puerto de desarrollo está fijado en `frontend/vite.config.js` (`server.port = 5173`,
`strictPort`): si el 5173 está ocupado, Vite falla en lugar de usar otro puerto, para que
coincida con el origen permitido por CORS en el backend.

## 12. Configuración de Supabase (CV)

El CV se guarda en Supabase Storage (API compatible con S3); MySQL solo almacena metadatos.

- `storage.driver = supabase` y las credenciales `s3.endpoint`, `s3.accessKey`,
  `s3.secretKey`, `s3.region`, con bucket privado `cvs`.
- Las claves viven **solo en el backend** y nunca llegan al frontend.
- Descarga mediante URL firmada temporal generada por el backend (RT-CV-05).
- Desarrollo sin credenciales: `storage.driver = local` guarda en `writable/uploads`
  (ignorado por Git) y la descarga usa una ruta interna autorizada.

## 13. Configuración opcional SUNAT

`sunat.token` (apis.net.pe/decolecta) habilita la verificación del RUC durante el
auto-registro de empresas. Sin token, ese paso no puede validarse contra SUNAT.

## 14. Configuración opcional SMTP

`email.host` y el resto de `email.*` habilitan las notificaciones de aprobación/rechazo y
el enlace de activación. Con `email.host` vacío no se envía correo y el administrador
entrega el enlace desde la bandeja de solicitudes.

## 15. Configuración opcional Google

`google.clientId` (backend) y `VITE_GOOGLE_CLIENT_ID` (frontend) habilitan el ingreso y
registro de postulantes con Google. El origen del frontend debe estar autorizado en la
consola de Google.

## 16. Solución de problemas

### Solución de problemas de migraciones

Si `php spark migrate` falla, verificar en orden:

1. PHP instalado y su versión (`php -v`).
2. Composer disponible (`composer --version`).
3. Extensión **mysqli** cargada (§17).
4. MySQL en ejecución (`docker compose ps` o el servicio del sistema).
5. Host de la base de datos (`database.default.hostname`).
6. Puerto (`database.default.port`, por defecto `3306`).
7. Nombre de la base de datos (`database.default.database`).
8. Usuario y contraseña (`database.default.username` / `password`).
9. Que exista el `.env` (copiado de `.env.example`) y que `database.default.DBDriver` sea `MySQLi`.

Comprobar primero la configuración del `.env`; **no** eliminar ni recrear la base de datos
como primera solución (se perderían datos).

### Permisos de `writable`

```bash
ls -ld writable writable/cache
sudo chown -R $USER:$USER writable
chmod -R u+rwX writable
mkdir -p writable/cache
```

## 17. MySQLi

El proyecto usa el driver **MySQLi**. Si no está cargado, `php spark migrate` falla.

```bash
php -v
php -m
php -m | grep mysqli        # Linux/macOS
```

En Windows (CMD):

```cmd
php -m | findstr mysqli
```

También se puede confirmar con:

```bash
php -i | grep mysqli        # Windows CMD: php -i | findstr mysqli
```

Si no aparece:

- **Ubuntu/Debian**:

  ```bash
  sudo apt update
  sudo apt install php-mysql
  php -m | grep mysqli
  ```

- **Windows**: localizar el `php.ini` que usa la instalación activa:

  ```cmd
  php --ini
  ```

  Editar ese `php.ini`, habilitar la extensión correspondiente a la versión de PHP
  (por ejemplo `extension=mysqli` o `extension=php_mysqli.dll`) y reiniciar el servidor
  web / la terminal. No asumir una versión de PHP: comprobar primero `php -v`.

Tras habilitarla, verificar de nuevo con `php -m | grep mysqli` y repetir
`php spark migrate`.

## 18. Pruebas

### Unitarias (backend)

```bash
cd backend
vendor/bin/phpunit            # o: vendor/bin/phpunit tests/unit/ValidadorTest.php
```

`tests/unit/ValidadorTest.php` cubre, entre otras reglas, la validación de teléfono
(acepta 9 u 11 dígitos; rechaza 8, 10, 12 y no numéricos).

### Smoke de la API (integración)

Cada script levanta un servidor temporal (`php spark serve` en :8080), ejecuta el flujo y
lo apaga. Requieren MySQL migrado y con los seeds base:

```bash
docker compose up -d mysql
cd backend && php spark migrate && php spark db:seed SystemSeeder && php spark db:seed DatosPruebaSeeder && cd ..
./tests/smoke/test_api.sh              # auth por rol, alta admin de empresas, CV
./tests/smoke/test_ofertas.sh          # ciclo de ofertas: publicación directa y cierre
./tests/smoke/test_fase3.sh            # bolsa/búsqueda, postulaciones y perfil (contacto + CV)
./tests/smoke/test_fase4.sh            # bandeja empresa, estados, CV autorizado
./tests/smoke/test_fase5.sh            # actividades, difusión y permisos por rol
./tests/smoke/test_fase6.sh            # contrataciones y reportes
./tests/smoke/test_desarrollo_nuevo.sh # auto-registro de empresa (RUC real), aprobación
```

`DatosMasivosSeeder` es opcional (carga masiva) y también requiere los seeds base. Detalle
en [`tests/README.md`](tests/README.md).

> El rate limiting (login/auth/CV), el límite de 4 CV por mes y el saneamiento de errores
> se validaron manualmente contra la API; aún no tienen pruebas automatizadas.

## 19. Producción

- Configurar desde `backend/env.production.example` (secretos, `app.baseURL`, CORS vía
  `cors.allowedOrigins`, expiración JWT, `INITIAL_ADMIN_*`, `sunat.token`, `email.*`,
  `google.clientId`, `app.frontendUrl`) y `frontend/.env` (`VITE_API_URL`,
  `VITE_GOOGLE_CLIENT_ID`).
- Almacenamiento de CV: `storage.driver = supabase` con credenciales S3 del bucket `cvs`;
  las claves solo viven en el backend.
- Entorno: `CI_ENVIRONMENT=production` y HTTPS (`forceGlobalSecureRequests`).
- Instalación: `php spark migrate` + `php spark db:seed SystemSeeder`; cambiar la
  contraseña del administrador inicial tras el primer acceso.
- Pendiente antes de producción (ver matriz): autorizar en la consola de Google el origen
  del frontend, revisar credenciales Supabase/SMTP/SUNAT y eliminar con una migración las
  tablas de perfil en desuso si ningún entorno tiene datos reales.

## Convenciones del backend

- Capas: `Controllers → Services → Repositories → Models/Entities`. Reglas de negocio en
  `Services` (nunca en controllers ni en el frontend).
- Respuestas API uniformes: `{success, message, data, errors}`; errores con código HTTP
  (`400/401/403/404/409/422/429/500`). Los `500` no exponen detalles internos.
- Validación: `Validador` con reglas planas (`required/min/max/email/ruc/dni/telefono/
  regex/enum/igual`).
- Auth: JWT (access corto) + refresh token rotativo; el filtro consulta el usuario en
  MySQL en cada request (revocación inmediata al desactivar).
- Endpoints y esquema documentados en
  [`backend/public/swagger/openapi.yaml`](backend/public/swagger/openapi.yaml) (Swagger UI
  en `backend/public/swagger/`; validación con `backend/docs/_validate_openapi.py`).

## Estado por fases

| Fase | Alcance | Commit |
|---|---|---|
| 1-7 | Esqueleto full-stack, ciclo de ofertas con validación municipal, perfil por secciones, bandeja de empresa, atenciones/ferias, contrataciones y endurecimiento | `7c2f30d`…`30dcf19` |
| 8 | Integración `desarrollo`: rediseño frontend (portal institucional, layouts por rol, admin) | `b60281c` |
| 9 | Auto-registro y activación de empresas, publicación directa de ofertas, bolsa pública, Google Sign-In | `b60281c` |
| 10 | Ajustes finales: retiro de secciones del perfil y del módulo de atenciones, "Demandante" → "Postulante" | `655b42c`, `6cfdd0f` |
| 11 | Endurecimiento: rate limiting, límite de 4 CV/mes, validación de teléfono, `password_hash` fuera de respuestas, errores saneados | `647c1f8`, `eb4664a` |
| 12 | Estabilización: logout único, admin inicial `MDJLO-SOL` vía `.env`, seeds idempotentes y separación de fixtures, README/MySQLi | — |

Cada RF/RN/RT con su estado y ubicación está trazado en
[`docs/matriz-cumplimiento.md`](docs/matriz-cumplimiento.md). Pruebas en
[`tests/README.md`](tests/README.md).
