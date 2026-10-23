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
├── docs/                  Requerimientos, cumplimiento y operaciones
├── deploy/                Compose, Nginx, scripts y certificados
├── .env.example           Plantilla única de configuración
└── backend|frontend/      Dockerfiles y código de aplicación
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
  bloqueo inmediato al desactivar la cuenta. Un administrador **no puede desactivar su
  propia cuenta** (validado en backend y reflejado en la UI).
- **Identidad y unicidad**: la empresa inicia sesión exclusivamente con RUC y el
  postulante con DNI (Google conserva su flujo). Correo y teléfono se normalizan y se
  reservan globalmente; RUC/DNI también se validan antes de crear cuentas o solicitudes.
  Las duplicidades históricas se documentan sin fusionar ni borrar cuentas.
- **Presencia digital de empresas**: la propia empresa configura sitio web e
  Instagram/Facebook/TikTok/X desde `/empresa/perfil` (tarjeta «Presencia digital»,
  `PUT /empresa/perfil/presencia`, separado del endpoint de datos de contacto para que uno
  no sobrescriba al otro). Los enlaces se muestran (sitio web arriba, luego solo las redes
  configuradas) en los modales de empresa de Postulante y Administración. Validación de URL
  en cliente y servidor (solo `http(s)`; cada red exige su dominio oficial o un subdominio).
  **Privacidad**: el teléfono y el correo de la empresa **no se entregan al rol
  `postulante`** (se excluyen en el backend y no se muestran en su modal); el rol `admin`
  sí los conserva.
- **Auto-registro de empresas**: solicitud pública con RUC verificado en SUNAT
  (`sunat.token`); el admin aprueba/rechaza desde una bandeja y la cuenta se activa con un
  enlace de un solo uso (`/activar-cuenta`). El login de empresa usa exclusivamente el RUC;
  el correo queda como dato de contacto y recuperación. El postulante inicia sesión con su
  DNI; las cuentas Google conservan su flujo de Google.
- **Ofertas laborales**: toda oferta nace **pendiente de revisión municipal**. El admin puede
  **aprobar** (pasa a `publicada`, recién visible y postulable), **observar** (pasa a
  `observada`: registra las correcciones requeridas y deja la oferta NO publicada; la empresa
  la edita y al guardar vuelve a `pendiente` conservando la observación) o **rechazar**
  definitivamente (`rechazada`: bloqueada para edición y publicación, terminal). Editar una
  oferta publicada también la devuelve a revisión. La empresa puede editar `borrador`,
  `pendiente`, `publicada` y `observada`, pero **no** `rechazada` ni `cerrada`. Estados:
  `borrador|pendiente → publicada|observada|rechazada → cerrada` (`borrador` solo heredado).
  Endpoints: `PUT /api/admin/ofertas/{id}/aprobar|observar|rechazar|cerrar` y
  `PUT /api/empresa/ofertas/{id}/enviar-revision|cerrar`.
- **Modo oscuro**: tema claro/oscuro global (admin, empresa, postulante y público) con una
  única fuente (`ThemeContext` + variables CSS) y preferencia persistida; botón con iconos
  Lucide en el sidebar y las cabeceras.
- **Texto enriquecido (RTE)**: descripción/funciones/requisitos de oferta y descripción de
  actividades aceptan formato básico (negrita, cursiva, subrayado, listas, enlaces) con
  **sanitización en backend** (allow-list; solo enlaces `http(s)`), contador de palabras y
  de caracteres sobre el **texto visible** (máx. 10.000, aviso desde 9.000). El editor
  (TiPTap) se carga de forma diferida y el render usa DOMPurify; el texto plano heredado
  se sigue mostrando y editando sin cambios.
- **Bolsa de empleo pública**: `/postulante/buscar` y las ofertas se consultan sin sesión;
  postular requiere cuenta de postulante.
- **Postulantes**: registro manual con auto-login (DNI) o ingreso con Google; perfil =
  datos personales/contacto + **CV** (obligatorio para postular). El CV se versiona y
  admite hasta 4 cargas por mes calendario; la interfaz muestra el consumo y el botón
  cambia de "Subir CV" a "Actualizar CV".
- **Validación de teléfono**: 9 u 11 dígitos (`^(?:\d{9}|\d{11})$`), validado en backend y
  en frontend.
- **Rate limiting** (token bucket de CI4): login 5 fallos por IP+identificador y 1 intento/60 s
  después; refresh/Google/registro 10 por IP y 1/30 s; subida de CV 10 por IP y 1/6 min.
  Responde `429` con `Retry-After`.
- **Errores seguros**: sobre uniforme `{success, message, data, errors}`; los `500`
  devuelven un mensaje genérico y el detalle solo queda en el log. El hash de contraseña
  nunca se expone en la API.
- **Documentos legales y aceptación**: el pie de las pantallas públicas enlaza a
  `/politica-privacidad`, `/terminos-condiciones`, `/aviso-legal` y `/politica-cookies`.
  El registro manual de postulantes y la solicitud de afiliación exigen una casilla de
  aceptación; el backend valida un booleano estricto y persiste `terms_accepted_at` y
  `terms_version` en `users` o `solicitudes_empresa`, dentro de la misma transacción.
- Nada se borra físicamente: activo/inactivo + historial (auditoría, `postulacion_historial`).

## 3. Requisitos

- PHP >= 8.2 con extensiones `curl`, `fileinfo`, `mysqli` (ver §17) · Composer 2
- MySQL 8 (o MariaDB compatible)
- Node.js >= 20 y npm
- Docker + Docker Compose (recomendado para desarrollo y producción)

## 4. Instalación

### Clonar el repositorio

```bash
git clone https://github.com/gidanodfu/SOL.git
cd SOL
```

### Configuración centralizada

Toda la configuración vive en un único archivo `.env` en la raíz:

```bash
cp .env.example .env
chmod 600 .env
# completar dominios, DB, administrador inicial y servicios externos
```

No hay `.env` en `backend/` ni `frontend/`. La plantilla completa está en
`.env.example` y el procedimiento detallado en
[`docs/operaciones.md`](docs/operaciones.md).

Los scripts de operación generan `deploy/runtime/backend.env` (permisos `600`,
ignorado por Git) con una lista explícita de variables del backend. Ese archivo
evita que el backend reciba `DB_ROOT_PASSWORD`, las credenciales iniciales, las
variables `VITE_*` o la configuración de Nginx/TLS. No lo edite a mano ni lo
versione. Si ejecuta `docker compose` directamente, defina
`BACKEND_ENV_FILE` apuntando a ese archivo; se recomienda usar los scripts.

### Desarrollo local con Docker

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh down      # conserva volúmenes
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`
- MySQL: `127.0.0.1:3307`
- Adminer: `http://localhost:8082`

### Alternativa sin Docker

El backend puede ejecutarse en el host usando el mismo `.env` raíz:

```bash
cd backend
composer install
php spark migrate
php spark db:seed SystemSeeder
php spark serve
```

El frontend usa el `.env` raíz mediante la configuración de Vite:

```bash
cd frontend
npm install
npm run dev
```

## 5. Configuración `.env`

La fuente única es `.env` en la raíz. Las variables principales son:

| Grupo | Variables |
|---|---|
| Aplicación | `CI_ENVIRONMENT`, `APP_URL`, `app.baseURL`, `app.appTimezone`, `cors.allowedOrigins` |
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_DRIVER` |
| Seguridad | `encryption.key`, `jwt.secret`, duraciones JWT, `INITIAL_ADMIN_*` |
| Almacenamiento | `storage.driver`, `storage.bucket`, `s3.*` |
| Servicios externos | `sunat.token`, `jsonpe.token` (alias legado `dni.token` aceptado por compatibilidad), `RESEND_*`, `email.*`, `google.clientId`, `turnstile.*` |
| Frontend público | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_TURNSTILE_SITE_KEY` |
| Docker/Nginx | `COMPOSE_PROJECT_NAME`, `DEV_*`, `APP_DOMAIN`, `API_DOMAIN`, `NGINX_MODE`, `TLS_*` |

Los secretos del backend nunca se pasan al contenedor frontend. Vite solo recibe
variables `VITE_*`; éstas se incorporan al bundle público y no deben contener
credenciales privadas. Las credenciales `INITIAL_ADMIN_*` solo se inyectan en la
ejecución puntual del bootstrap/seeder, no en el backend en funcionamiento.

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
>
> `identidades_reservadas` centraliza la unicidad de email, teléfono, RUC y DNI. La
> migración la rellena con los datos existentes; los valores duplicados quedan como
> `estado=conflicto` con referencias por id (sin borrar ni fusionar cuentas) y bloquean
> nuevas altas hasta su resolución administrativa. El diagnóstico local está en
> [`docs/identidad-conflictos.md`](docs/identidad-conflictos.md).

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
`app.baseURL` y `VITE_API_URL` en el `.env` raíz. En Docker use
`./deploy/scripts/dev.sh`.

### Estructura pública de la API

- **API REST: `/api`** (sin versionado; no existe `/api/v1`). Agrupa los endpoints de
  negocio descritos en la especificación OpenAPI: públicos, autenticados (`jwt`), y los
  grupos `admin`, `empresa` y `postulante` con autorización por rol.
- **`GET /`**: mensaje institucional (JSON, sin auth).
- **`GET /health`**: health check (JSON, sin auth).

### Health check

```bash
curl -i http://localhost:8080/health
```

- Público, sin autenticación, sin base de datos ni servicios externos.
- Responde `200` con un JSON mínimo:

```json
{ "success": true, "message": "Servicio disponible.", "data": { "status": "ok" } }
```

### Public API URL

La API pública se sirve mediante `deploy/compose.prod.yaml` y Nginx. Complete
`APP_DOMAIN`, `API_DOMAIN`, `NGINX_MODE`, `APP_URL`, `app.baseURL` y
`cors.allowedOrigins` en el `.env` del servidor. El health check queda disponible
en `https://<dominio>/health` (modalidad same-domain) o
`https://<api-dominio>/health` (subdominio).

Consulte [`deploy/README.md`](deploy/README.md) y
[`docs/operaciones.md`](docs/operaciones.md) para bootstrap, TLS y despliegue.

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
  `s3.secretKey`, `s3.region`, con el bucket privado indicado en `storage.bucket`.
  La plantilla usa `cvs` como ejemplo; el `.env` local usa otro nombre. Confirme
  el bucket real antes de producción.
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
4. MySQL en ejecución (`./deploy/scripts/dev.sh status` o el servicio del sistema).
5. Host de la base de datos (`DB_HOST`).
6. Puerto (`DB_PORT`, por defecto `3306`).
7. Nombre de la base de datos (`DB_DATABASE`).
8. Usuario y contraseña (`DB_USER` / `DB_PASSWORD`).
9. Que exista el `.env` (copiado de `.env.example`) y que `DB_DRIVER` sea `MySQLi`.

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

### Frontend

```bash
cd frontend
npm test                       # pruebas estáticas de rutas, footer y aceptación
npm run lint
npm run build
```

### Smoke de la API (integración)

Cada script levanta un servidor temporal (`php spark serve` en :8080), ejecuta el flujo y
lo apaga. Requieren MySQL migrado y con los seeds base:

Los smoke tests requieren un entorno aislado con `DatosPruebaSeeder` y ejecutan
`php spark serve` desde el host; no deben apuntar a la base de datos migrada de
desarrollo o producción. Use una base de pruebas y detenga el backend Docker si
el puerto 8080 está ocupado:

```bash
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh seed DatosPruebaSeeder   # solo en una base de pruebas
./tests/smoke/test_api.sh              # auth por rol, alta admin de empresas, CV
./tests/smoke/test_ofertas.sh          # ciclo de ofertas: revisión municipal, reenvío y cierre
./tests/smoke/test_aprobacion_ofertas.sh # aprobación/rechazo, visibilidad y mass assignment
./tests/smoke/test_fase3.sh            # bolsa/búsqueda, postulaciones y perfil (contacto + CV)
./tests/smoke/test_fase4.sh            # bandeja empresa, estados, CV autorizado
./tests/smoke/test_fase5.sh            # actividades, difusión y permisos por rol
./tests/smoke/test_fase6.sh            # contrataciones y reportes
./tests/smoke/test_seguridad.sh        # booleanos, fechas, URLs, rate limit y cabeceras
./tests/smoke/test_rte.sh              # RTE: saneado, enlaces, texto plano y límite 10k
./tests/smoke/test_identidad.sh        # login por RUC/DNI y rechazo de duplicados
./tests/smoke/test_desarrollo_nuevo.sh # auto-registro de empresa (RUC real), aprobación
```

`DatosMasivosSeeder` es opcional (carga masiva) y también requiere los seeds base. Detalle
en [`tests/README.md`](tests/README.md).

> El rate limiting (login/auth/CV), el límite de 4 CV por mes y el saneamiento de errores
> se validaron manualmente contra la API; aún no tienen pruebas automatizadas.

## 19. Producción

- Configuración única en `.env` raíz, con secretos propios de producción.
- Instalación nueva: `./deploy/scripts/bootstrap.sh --prod`.
- Actualizaciones: `./deploy/scripts/deploy.sh` (no ejecuta `SystemSeeder`).
- Nginx: `deploy/compose.prod.yaml`; modos `http`, `same-domain` o `subdomain`.
- Certificados: `deploy/nginx/certs/` (o `TLS_CERTS_DIR`) montados en solo lectura.
- Persistencia: volúmenes `sol_<proyecto>_mysql_data` y
  `sol_<proyecto>_backend_writable`.
- Almacenamiento de CV: `storage.driver=supabase` con credenciales S3 privadas.
- Entorno: `CI_ENVIRONMENT=production` y HTTPS.
- Pendiente: DNS/dominios, certificados reales, Google OAuth, Turnstile,
  Supabase, Resend/SMTP, SUNAT/RENIEC y revisión de credenciales.
- La API envía cabeceras de seguridad (`secureheaders`) pero no aplica CSP global:
  configurar CSP en el hosting del frontend.

Procedimiento completo:
[`deploy/README.md`](deploy/README.md) y [`docs/operaciones.md`](docs/operaciones.md).

### Dominios, subdominios y SPA fallback

| Entorno | `app.baseURL` | `APP_URL` | `cors.allowedOrigins` | `VITE_API_URL` |
|---|---|---|---|---|
| local | `http://localhost:8080/` | `http://localhost:5173` | `http://localhost:5173` | `http://localhost:8080` |
| producción same-domain | `https://APPDOMAIN/` | `https://APPDOMAIN` | `https://APPDOMAIN` | vacío |
| producción subdomain | `https://APIDOMAIN/` | `https://APPDOMAIN` | `https://APPDOMAIN` | `https://APIDOMAIN` |

- `APP_URL` es obligatoria para los enlaces de activación.
- CORS sin cookies (`supportsCredentials=false`): autenticación JWT Bearer.
- El frontend incluye SPA fallback en su `frontend/nginx.conf`; Nginx de borde
  proxyfica el frontend.

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

## Autores

La titularidad legal del copyright se establece únicamente en el archivo
[`LICENSE`](LICENSE).

## Licencia

Distribuido bajo la licencia **MIT**. Ver [`LICENSE`](LICENSE) en la raíz del
repositorio. El identificador SPDX (`SPDX-License-Identifier: MIT`) está en el
encabezado de los archivos de código propios.

## Estado por fases

| Fase | Alcance | Commit |
|---|---|---|
| 1-7 | Esqueleto full-stack, ciclo de ofertas con validación municipal, perfil por secciones, bandeja de empresa, atenciones/ferias, contrataciones y endurecimiento | `7c2f30d`…`30dcf19` |
| 8 | Integración `desarrollo`: rediseño frontend (portal institucional, layouts por rol, admin) | `b60281c` |
| 9 | Auto-registro y activación de empresas, publicación directa de ofertas, bolsa pública, Google Sign-In | `b60281c` |
| 10 | Ajustes finales: retiro de secciones del perfil y del módulo de atenciones, "Demandante" → "Postulante" | `655b42c`, `6cfdd0f` |
| 11 | Endurecimiento: rate limiting, límite de 4 CV/mes, validación de teléfono, `password_hash` fuera de respuestas, errores saneados | `647c1f8`, `eb4664a` |
| 12 | Estabilización: logout único, admin inicial `MDJLO-SOL` vía `.env`, seeds idempotentes y separación de fixtures, README/MySQLi | `0a04284` |
| 13 | Saneamiento integral: protección de autodesactivación del admin, retiro del filtro "Puesto o empresa", integridad (historial de postulación, contratación activa, total con `q`, transacciones), limpieza de dependencias y documentación sincronizada | — |
| 14 | Revisión municipal de ofertas (aprobación/rechazo), modo oscuro global con persistencia, sidebar unificado con panel móvil y endurecimiento (booleanos, fechas, URLs, rate limit, cabeceras) | — |

Cada RF/RN/RT con su estado y ubicación está trazado en
[`docs/matriz-cumplimiento.md`](docs/matriz-cumplimiento.md). Pruebas en
[`tests/README.md`](tests/README.md).
