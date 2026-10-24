# Sistema de Empleo — Municipalidad Distrital de José Leonardo Ortiz

## 1. Descripción

Sistema web de intermediación laboral de la Unidad Funcional del Empleo (Resolución de
Gerencia Municipal N.° 000197-2025-MDJLO-GM): bolsa de empleo pública, auto-registro de
empresas con aprobación municipal, postulaciones con CV y trazabilidad de la contratación.
La especificación funcional está en `docs/requerimientos.md` y la trazabilidad RF/RN/RT en
`docs/matriz-cumplimiento.md`.

## 2. Arquitectura

```
SOL/
├── backend/               CodeIgniter 4 (PHP 8.4.27 en Docker) — API REST, reglas, auth
├── frontend/              React + Vite (Node 22.23.4 en Docker) — SPA
├── tests/smoke/           Smoke HTTP y pruebas de integración en Docker
├── docs/                  Requerimientos, cumplimiento y operaciones
├── deploy/                Compose, Nginx, scripts y certificados legado
├── deploy/infra/traefik/  Proxy compartido del VPS (red `proxy` y entrada SOL)
├── .env.example           Plantilla única de configuración
└── backend|frontend/      Dockerfiles, php.ini y configuración de servidor
```

```
Internet ──80/443──▶ Traefik (infra compartida)
                         ├── red `proxy` ──▶ otros proyectos
                         └── red `sol_entry` (exclusiva) ──▶ SOL Nginx interno
                                                               ├── /api ──▶ PHP-FPM ──▶ MySQL
                                                               │              └──────▶ Supabase Storage (CV, S3)
                                                               └── /    ──▶ Nginx frontend (dist)
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

**Docker es la única vía oficial de desarrollo y operación.** El host solo necesita:

- Docker Engine >= 24.
- Docker Compose v2 >= 2.24 (`docker compose`).
- Git.
- Un shell POSIX (`sh`), `awk`, `grep`, `sed` y `curl` para los scripts de diagnóstico HTTP.

No es necesario instalar PHP, Composer, Node.js, npm, MySQL ni las dependencias de la
aplicación en el host. Las versiones de las imágenes están fijadas en los Dockerfiles y
en `deploy/compose.yaml`; consulte `deploy/README.md` para actualizarlas.

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
versione. Use siempre los scripts; si necesita invocar Compose manualmente,
exporte `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"` después de que un
script lo haya generado.

### Desarrollo local con Docker

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh down      # conserva volúmenes
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`
- MySQL: `127.0.0.1:3307`
- Adminer opcional: `http://localhost:8082` (`./deploy/scripts/dev.sh tools`)

`dev.sh up` nunca ejecuta migraciones ni seeders, aunque la base esté vacía.
Para una instalación nueva use `bootstrap.sh --dev --authorize`; para un entorno
ya migrado use `dev.sh migrate`.

### Instalación inicial

```bash
# Desarrollo (crea el administrador y categorías base)
./deploy/scripts/bootstrap.sh --dev --authorize

# Producción (requiere un .env de producción y confirmación explícita)
./deploy/scripts/bootstrap.sh --prod --authorize
```

`bootstrap.sh` es el único procedimiento autorizado para ejecutar `SystemSeeder`.
No se ejecuta desde `up`, `restart` ni `deploy.sh`. Se niega a continuar si la base
ya contiene usuarios.

## 5. Configuración `.env`

La fuente de configuración es un archivo privado por entorno, normalmente
`.env` en la raíz; puede seleccionar otro con `ENV_FILE`. `.env.example` es la
única plantilla versionada. Las variables principales son:

| Grupo | Variables |
|---|---|
| Aplicación | `CI_ENVIRONMENT`, `APP_URL`, `app.baseURL`, `app.appTimezone`, `cors.allowedOrigins` |
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_DRIVER` |
| Seguridad | `encryption.key`, `jwt.secret`, duraciones JWT, `INITIAL_ADMIN_*` |
| Almacenamiento | `storage.driver`, `storage.bucket`, `s3.*` |
| Servicios externos | `sunat.token`, `jsonpe.token` (alias legado `dni.token` aceptado por compatibilidad), `RESEND_*`, `email.*`, `google.clientId`, `turnstile.*` |
| Frontend público | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_TURNSTILE_SITE_KEY` |
| Docker/Nginx | `COMPOSE_PROJECT_NAME`, `SOL_ENTRY_NETWORK`, `TRAEFIK_ENTRY_IP`, `DEV_*`, `APP_DOMAIN`, `API_DOMAIN`, `NGINX_MODE`, `TLS_*` |

`COMPOSE_PROJECT_NAME` debe ser único por entorno. Desarrollo usa `sol_dev` por
defecto; producción debe usar otro nombre, por ejemplo `sol_prod`. Los scripts de
producción rechazan `sol_dev` para evitar reutilizar redes o volúmenes por error.

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
./deploy/scripts/dev.sh migrate            # aplica migraciones pendientes
./deploy/scripts/dev.sh migration-status   # consulta ejecutadas/pendientes
```

También se puede usar el contenedor directamente para una tarea puntual:

```bash
./deploy/scripts/dev.sh exec backend php spark migrate:status
```

No ejecute `php spark` en el host. Las migraciones de producción las aplica
`deploy.sh` dentro del contenedor backend; no las ejecute manualmente contra
producción durante una revisión.

Tablas principales del esquema: `users`, `user_refresh_tokens`, `auditoria`, `empresas`,
`postulantes`, `cvs`, `categorias`, `ofertas`, `ofertas_habilidades`, `postulaciones`,
`postulacion_historial`, `solicitudes_empresa`, `activaciones`, `actividades`,
`oportunidades`, `contrataciones`, entre otras. Las tablas de perfil retiradas
(`formacion_academica`, `experiencia_laboral`, `habilidades`, `cursos_certificaciones`) y
`atenciones` siguen creadas por las migraciones históricas pero ya no se usan; pueden
eliminarse con una migración cuando se confirme que ningún entorno tiene datos reales.

> No hay un número fijo de migraciones: `./deploy/scripts/dev.sh migrate` siempre aplica las pendientes.
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
# Solo en desarrollo/pruebas, con confirmación explícita
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
./deploy/scripts/dev.sh seed DatosMasivosSeeder --yes

# Instalación inicial (único camino autorizado para SystemSeeder)
./deploy/scripts/bootstrap.sh --dev --authorize
```

> `SystemSeeder` y los seeds de prueba están separados a propósito: la instalación inicial
> no carga empresas, postulantes ni credenciales ficticias. Los seeders de prueba
> abortan si `CI_ENVIRONMENT=production`.

## 9. Usuario administrador inicial

La instalación inicial (`bootstrap.sh --dev|--prod --authorize`) deja **una
única cuenta administradora**, provisionada desde el `.env`:

| Dato | Origen |
|---|---|
| Usuario | `INITIAL_ADMIN_USERNAME` |
| Contraseña inicial | `INITIAL_ADMIN_PASSWORD` (se guarda con hash) |
| Rol | `admin` |

- La contraseña se lee de `INITIAL_ADMIN_PASSWORD` y se guarda **con hash**
  (`password_hash(PASSWORD_DEFAULT)`); nunca se escribe en migraciones ni en código.
- Si `INITIAL_ADMIN_PASSWORD` está vacío, `SystemSeeder` no crea la cuenta e indica cómo
  configurarla.
- **Cambie la contraseña después del primer acceso** (Mi cuenta → contraseña).
- Las demás cuentas (`empresa`, `postulante`) se crean por sus flujos reales
  (auto-registro/activación y registro público). Los roles `empresa` y `postulante` se
  mantienen.
- Una segunda ejecución de `bootstrap.sh` sobre una base con usuarios se rechaza; no
  restablece contraseñas ni duplica el administrador.

## 10. Ejecución backend

El backend se ejecuta dentro del contenedor de desarrollo:

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh shell backend
```

Dentro de esa shell puede ejecutar tareas puntuales, por ejemplo:

```bash
./deploy/scripts/dev.sh exec backend php spark routes
./deploy/scripts/dev.sh exec backend php spark migrate:status
```

No es necesario instalar PHP ni ejecutar `php spark serve` en el host. El
contenedor de desarrollo ya ejecuta `php spark serve --host 0.0.0.0 --port 8080`.
En producción se usa PHP-FPM detrás de Nginx, nunca el servidor de desarrollo.

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

La API pública se sirve mediante Traefik (infraestructura compartida) y el
Nginx interno de `deploy/compose.prod.yaml`. Complete `APP_DOMAIN`,
`API_DOMAIN`, `SOL_ENTRY_NETWORK`, `TRAEFIK_ENTRY_IP`, `APP_URL`,
`app.baseURL` y `cors.allowedOrigins` en el `.env` del servidor. Use
`NGINX_MODE=http`: TLS termina en Traefik. El health check queda disponible en
`https://<dominio>/health` (same-domain) o `https://<api-dominio>/health`
(subdomain).

Consulte [`deploy/README.md`](deploy/README.md),
[`deploy/infra/traefik/README.md`](deploy/infra/traefik/README.md) y
[`docs/operaciones.md`](docs/operaciones.md) para bootstrap, TLS y despliegue.
El health check **interno** se ejecuta dentro del contenedor Nginx y no
depende de DNS; el smoke público se ejecuta aparte con `PUBLIC_SMOKE=1` o
`validate.sh --runtime --public-smoke`.

## 11. Ejecución frontend

```bash
./deploy/scripts/dev.sh up          # Vite con recarga automática en :5173
./deploy/scripts/test.sh frontend   # tests + lint + build dentro de Docker
./deploy/scripts/dev.sh exec frontend npm run build
```

El puerto de desarrollo está fijado en `frontend/vite.config.js` (`server.port = 5173`,
`strictPort`): si el 5173 está ocupado, Vite falla en lugar de usar otro puerto, para que
coincida con el origen permitido por CORS en el backend.

No ejecute `npm install`, `npm run dev` ni `npm run build` en el host. `node_modules`
del host no es una dependencia del proyecto; la imagen instala con `npm ci`.

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

## 15. Configuración opcional Google y Turnstile

`google.clientId` (backend) y `VITE_GOOGLE_CLIENT_ID` (frontend) habilitan el
ingreso y registro de postulantes con Google. Deben estar ambos presentes y ser
el mismo cliente web, o ambos vacíos. Autorice en Google Cloud Console:

- desarrollo: `http://localhost:<DEV_FRONTEND_PORT>` (por defecto
  `http://localhost:5173`);
- producción: `https://<APP_DOMAIN>`.

Use clientes OAuth separados por entorno. `VITE_GOOGLE_CLIENT_ID` se incorpora
en el build de Vite: si cambia, reconstruya el frontend.

Cloudflare Turnstile en producción exige `turnstile.enabled=true`, la secret
key del backend, la site key pública y `turnstile.hostnames` con el
`APP_DOMAIN` exacto, sin protocolo, ruta ni puerto. En desarrollo puede usar
`turnstile.enabled=false` o las credenciales de prueba de Cloudflare.

## 16. Solución de problemas

### Solución de problemas de migraciones

Si una migración falla, verificar en orden:

1. Estado del stack: `./deploy/scripts/dev.sh status`.
2. Logs del backend: `./deploy/scripts/dev.sh logs backend`.
3. Logs de MySQL: `./deploy/scripts/dev.sh logs db`.
4. Variables de conexión dentro del contenedor:
   `./deploy/scripts/dev.sh exec backend php -r 'echo getenv("DB_HOST")," ",getenv("DB_PORT"),PHP_EOL;'`.
5. Que el `.env` exista (copiado de `.env.example`) y que `DB_DRIVER` sea `MySQLi`.
6. Estado de migraciones: `./deploy/scripts/dev.sh migration-status`.

No elimine ni recree la base de datos como primera solución: se perderían datos.
No use `docker compose down -v`.

### Permisos de `writable`

El entrypoint del backend crea y ajusta `writable/` dentro del contenedor; no
hace falta cambiarlo desde el host. Para revisar el volumen:

```bash
./deploy/scripts/dev.sh exec backend ls -la writable
```

Si un archivo no se puede escribir, reconstruya la imagen y revise los logs; no
ejecute `chown` sobre el host ni borre el volumen.

## 17. MySQLi

El driver **MySQLi** y las extensiones requeridas se instalan en la imagen
`backend/Dockerfile`; no se instalan en el host. Para comprobar la imagen:

```bash
./deploy/scripts/dev.sh exec backend php -m
./deploy/scripts/dev.sh exec backend php -m | grep mysqli
```

Si falta una extensión, corrija `backend/Dockerfile` y reconstruya con
`./deploy/scripts/dev.sh build`. No instale paquetes PHP en el host para
“arreglar” la imagen.

## 18. Pruebas

Todas las pruebas oficiales se ejecutan mediante Docker. No se requiere PHP,
Node.js, Composer, npm ni MySQL instalados en el host.

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP no destructivo (stack activo)
./deploy/scripts/test.sh validation # validación preventiva + health interno + ACME
./deploy/scripts/test.sh smoke      # integración profunda en MySQL temporal
```

`test.sh validation` no usa secretos reales y comprueba Turnstile, Google,
URLs/CORS, health interno sin DNS y la inicialización del resolver ACME. La CI
`.github/workflows/ci.yml` ejecuta validación, backend, frontend, build y smoke
HTTP local con un `.env` sintético.

### Unitarias backend

```bash
./deploy/scripts/test.sh backend
```

También puede ejecutar un archivo concreto dentro del contenedor:

```bash
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit tests/unit/ValidadorTest.php
```

`tests/unit/ValidadorTest.php` cubre, entre otras reglas, la validación de teléfono
(acepta 9 u 11 dígitos; rechaza 8, 10, 12 y no numéricos).

### Frontend

```bash
./deploy/scripts/test.sh frontend
```

El comando ejecuta `npm test`, `npm run lint` y `npm run build` dentro de la
imagen. Los `node_modules` del host no se usan.

### Smoke HTTP oficial

Con el stack de desarrollo activo (`dev.sh up`):

```bash
./deploy/scripts/test.sh http
```

Comprueba `/health`, `/`, `/api/ofertas`, el rechazo `401` de `/api/auth/me`, el
preflight CORS y el frontend. No crea ni modifica datos.

### Pruebas de integración profundas

```bash
./deploy/scripts/test.sh smoke
```

El runner construye una imagen de pruebas con `bash`, `python3` y `curl`,
levanta un MySQL **temporal en tmpfs** dentro de una red efímera, crea un
esquema distinto por suite, aplica migraciones y seeds, y ejecuta los scripts
con `php spark serve` **dentro del contenedor**. No toca `sol_dev_*`, no publica
puertos y no usa herramientas de aplicación del host. `test_desarrollo_nuevo.sh`
queda excluido porque depende de SUNAT/RUC real; consulte
[`tests/README.md`](tests/README.md). El runner agrega fallos y devuelve código
distinto de cero ante aserciones, errores de Python/JSON o estados HTTP
inesperados; no imprime JWT ni refresh tokens.

> El rate limiting (login/auth/CV), el límite de 4 CV por mes y el saneamiento de errores
> se validaron manualmente contra la API; aún no tienen pruebas automatizadas.

## 19. Producción

- Configuración única en `.env` raíz, con secretos propios de producción.
- `COMPOSE_PROJECT_NAME` debe ser distinto de `sol_dev` (por ejemplo `sol_prod`);
  `deploy.sh` y `bootstrap.sh` lo exigen.
- Infraestructura compartida: `deploy/infra/traefik/` publica 80/443, crea la
  red externa `proxy` para otros proyectos y la red exclusiva `sol_entry` para
  la entrada de SOL. Debe desplegarse antes que SOL.
- SOL usa `SOL_ENTRY_NETWORK=sol_entry`, `TRAEFIK_ENTRY_IP=172.31.0.2` y
  `NGINX_MODE=http`; su Nginx es interno, no se conecta a `proxy` y no publica
  puertos. Solo Traefik, por su IP fija en `sol_entry`, puede alcanzarlo;
  Nginx solo confía en esa IP para `X-Forwarded-For`/`Proto`. Traefik termina
  TLS y enruta por dominio.
- Instalación nueva: `./deploy/scripts/bootstrap.sh --prod --authorize`.
- Actualizaciones: `./deploy/scripts/deploy.sh` (no ejecuta `SystemSeeder`).
- Certificados/ACME: gestionados por Traefik en `deploy/infra/traefik`. El
  resolver `letsencrypt` se define una sola vez en la plantilla `traefik.yml`,
  que se renderiza con `ACME_EMAIL` y `ACME_CA_SERVER`; no use argumentos ACME
  duplicados en Compose. Las plantillas HTTPS de `deploy/nginx/` se conservan
  solo para un Nginx standalone legado.
- Health: bootstrap, deploy y restore usan el health interno de Nginx, sin DNS
  público. El smoke público es independiente (`PUBLIC_SMOKE=1`).
- Validación previa: `./deploy/scripts/validate.sh --prod` y
  `./deploy/scripts/test.sh validation`. La CI no usa secretos reales.
- Persistencia: volúmenes `sol_<proyecto>_mysql_data` y
  `sol_<proyecto>_backend_writable`.
- Almacenamiento de CV: `storage.driver=supabase` con credenciales S3 privadas.
- Entorno: `CI_ENVIRONMENT=production` y HTTPS público.
- Respaldos: `./deploy/scripts/backup.sh prod`; restauración controlada:
  `./deploy/scripts/restore.sh --env prod --db <archivo.sql> --confirm "RESTORE:<proyecto>:prod" --allow-production`.
- Estado operativo conocido: despliegue VPS con dominio `ufe.a-415.win`,
  Cloudflare, Traefik v3.6, proyecto `sol_prod`, volumen ACME
  `sol_infra_traefik_acme` y certificado Let's Encrypt ya emitido. Este
  repositorio no se conecta al VPS para verificarlo.
- Pendiente de validación separada: DNS/Cloudflare, renovación TLS, OAuth,
  Turnstile, Supabase, Resend/SMTP, SUNAT/RENIEC y credenciales externas.
- La API envía cabeceras de seguridad (`secureheaders`); Traefik añade HSTS en
  HTTPS. No se aplica CSP global. Configurar CSP en el hosting del frontend.

Procedimiento completo:
[`deploy/README.md`](deploy/README.md), [`deploy/infra/traefik/README.md`](deploy/infra/traefik/README.md)
y [`docs/operaciones.md`](docs/operaciones.md).

### Dominios, subdominios y SPA fallback

| Entorno | `app.baseURL` | `APP_URL` | `cors.allowedOrigins` | `VITE_API_URL` |
|---|---|---|---|---|
| local | `http://localhost:8080/` | `http://localhost:5173` | `http://localhost:5173` | `http://localhost:8080` |
| producción same-domain | `https://APPDOMAIN/` | `https://APPDOMAIN` | `https://APPDOMAIN` | vacío |
| producción subdomain | `https://APIDOMAIN/` | `https://APPDOMAIN` | `https://APPDOMAIN` | `https://APIDOMAIN` |

- `APP_URL` es obligatoria para los enlaces de activación.
- En producción, `APP_DOMAIN` y `API_DOMAIN` se enrutan desde Traefik; SOL mantiene
  `NGINX_MODE=http` y no monta TLS. Si ambos dominios son iguales, Nginx sirve
  frontend y API en el mismo host. Si son distintos, el host de API solo
  responde con la API y no devuelve el frontend; el host del frontend devuelve
  `404` para `/api`.
- CORS sin cookies (`supportsCredentials=false`): autenticación JWT Bearer.
- El frontend incluye SPA fallback en su `frontend/nginx.conf`; el Nginx interno
  de SOL proxyfica el frontend y Traefik hace la entrada pública.

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
