# Auditoría del Backend — Sistema de Empleo (SOL) · Municipalidad Distrital de José Leonardo Ortiz

- **Alcance**: backend CodeIgniter 4 (API REST) en `backend/`.
- **Fecha**: revisión del 2026-09-08. **Solo lectura**: no se modificó lógica, rutas ni base de datos.
- **Nota de vigencia (2026-09-08, tras integración de `desarrollo`)**: los hallazgos que citan
  secciones del perfil (`perfil/{seccion}`: formacion/experiencia/habilidades/cursos) y el
  módulo de atenciones (`admin/atenciones`) son **históricos**: ambas funcionalidades se
  retiraron (rutas, controladores/servicios y código eliminados; las tablas quedan sin
  uso). La API incorporó después del corte: auto-registro y activación de empresas (RUC
  SUNAT + enlace de un solo uso), publicación directa de ofertas por la empresa, bolsa de
  empleo pública (`GET /api/ofertas`), ingreso con Google y bandeja admin de solicitudes.
  La especificación `public/swagger/openapi.yaml` está actualizada con esos cambios.
- **Actualización 2026-09-10**: ver la sección *"Actualización post-correcciones"* más
  abajo. Se resolvieron E1, S1, S4, S12 y Q8 (fuga de `password_hash`, rate limiting,
  saneamiento de errores) y se añadieron la validación de teléfono y una cuota de 4 CV/mes
  que fue retirada el 2026-11-02 en favor de rate limiting configurable.
- **Stack observado**: PHP 8.4.27 (imagen Docker), CodeIgniter 4.7, MySQL 8.0.46 (`sistema_empleo`, driver MySQLi), JWT HS256 (`firebase/php-jwt` 7.1), almacenamiento de CV Supabase S3 con driver local de respaldo.
- **Artefactos generados**:
  - `public/swagger/openapi.yaml` — especificación OpenAPI 3.0.3 de la API real.
  - `public/swagger/index.html` — Swagger UI (CDN) que carga `./openapi.yaml`.
  - `public/swagger/_validate_openapi.py` / `docs/_validate_openapi.py` — validador offline de la especificación (parseo YAML, `$ref`, `operationId`, métodos).

> Convención de severidades: **CRÍTICO** (datos/seguridad/funcionamiento principal), **ALTO** (rompe funcionalidad importante), **MEDIO** (errores en situaciones concretas), **BAJO** (menor/inconsistencia). Clasificación de seguridad: **CONFIRMADO** (evidencia en código), **POSIBLE**, **RECOMENDACIÓN**.

> **Estado vigente al 2026-11-02 (SOL 1.4.8).** Este documento conserva la
> auditoría histórica del 2026-09-08 y sus actualizaciones. Para el estado
> actual prevalecen las siguientes correcciones ya implementadas:
> **E1, E2, E3, E4, E5, E6, F2, F4, F8, F9, F10, F11, F12, F13, S1, S2, S4,
> S11, S12 y Q8** están resueltos y cubiertos por pruebas o por la arquitectura
> vigente. En particular: aprobar ofertas revalida `fecha_cierre`; las
> escrituras multi-tabla usan transacciones; la edición de empresa sincroniza
> `users`; los booleanos se validan de forma estricta; el detalle público
> excluye ofertas vencidas; Actividades excluye finalizadas del portal; el
> rechazo registra `validado_por`/`fecha_validacion`; la bandeja admin prioriza
> pendientes; `required` rechaza espacios; las fechas se validan con calendario
> y `Validador`; y la zona horaria de negocio es `America/Lima`.
>
> Sobre `Config\App::$proxyIPs`: en el entorno local el tráfico llega
> directamente al backend, por lo que no es un pendiente. Si en el futuro se
> coloca un proxy delante, configure `proxyIPs` con su dirección.
>
> Quedan como **recomendaciones no bloqueantes**, no como vulnerabilidades
> actuales: ampliar la cobertura de auditoría (F16), métricas/consultas N+1
> (F6/H3), límites del detalle JSON de auditoría (F17), índices adicionales
> (H1) y la política explícita de re-postulación tras un retiro (F5).

> **Nota 2026-11-11:** este documento describe el estado histórico sobre MySQL
> 8.0. La base operativa actual es MariaDB 11.4.13 LTS con el driver `MySQLi`;
> las conclusiones funcionales y de seguridad siguen vigentes salvo las
> diferencias de motor documentadas en `docs/migracion-mariadb.md`.

---

## Actualización post-correcciones (2026-09-10)

Esta sección registra el endurecimiento aplicado con posterioridad al informe original.
Los hallazgos afectados se marcan como **RESUELTO** en sus tablas, conservando el registro
histórico. No cambió el esquema de base de datos ni se añadieron variables `.env`.

**Seguridad**
- **`password_hash` ya no se expone** (`GET /api/admin/usuarios`). `UsuarioRepository::base()`
  pasó de `users.*` a una lista explícita de columnas seguras; el hash permanece solo en el
  backend. Resuelve **E1** y **S1**.
- **Errores saneados**: `ApiExceptionHandler` responde un mensaje genérico en los `500` y
  registra el detalle (SQL, rutas, excepciones) solo en el log; `Config/Exceptions.php`
  enruta toda excepción HTTP de la API a JSON uniforme (en CLI se conserva el handler por
  defecto). Resuelve **S12** y **Q8**.
- **Rate limiting** implementado con `app/Filters/ThrottleFilter.php` (Throttler nativo de
  CI4). Resuelve **S4**.

**Rate limits de autenticación (token bucket de CI4; respuesta `429` + cabecera `Retry-After`)**
El Throttler nativo implementa un token bucket: permite una ráfaga inicial (= capacidad) y
luego repone 1 token cada `segundos / capacidad`. Para autenticación **no es un bloqueo de
ventana fija**, por lo que el `Retry-After` es el intervalo de recarga (≈ 60 s en login), no
el total de la ventana. La carga de CV usa ventanas fijas persistidas (ver más abajo).

| Endpoint | Ráfaga | Recarga | Identificación |
|---|---|---|---|
| `POST /api/auth/login` | 5 intentos fallidos | 1/60 s | IP + usuario (se reinicia en login correcto) |
| `POST /api/auth/refresh` | 10 | 1/30 s | IP + ruta |
| `POST /api/auth/google` | 10 | 1/30 s | IP + ruta |
| `POST /api/registro/postulante` | 10 | 1/30 s | IP + ruta |
| `POST /api/postulante/cv` | 5/10 min y 20/h | ventana fija | usuario autenticado |
| `POST /api/postulante/cv` | 10/10 min y 40/h | ventana fija | IP |

**Rate limiting de CV**: no existe cuota mensual. `CvRateLimiter` persiste ventanas
fijas en `rate_limit_contadores` y consume dos contadores por usuario y dos por IP;
`GET_LOCK('sol_cv_<postulante>', 0)` impide una segunda carga simultánea. Al superar
un límite responde `429` con `Retry-After` sin modificar el CV. Los valores se
configuran con `cvRateLimit.*`.

**Validación de teléfono**: los campos `telefono` aceptan 9 u 11 dígitos
(`Validador` regla `telefono`), tanto en backend como en frontend.

**Conexiones MySQL**: se mantiene la gestión nativa de CI4 (una conexión compartida por
request vía `db_connect()`); **no** se implementó un pool personalizado ni `pConnect`.

**Estabilización posterior**: logout unificado en un único componente/handler (frontend),
administrador inicial `MDJLO-SOL` provisionado por `.env` (`INITIAL_ADMIN_*`) y
`SystemSeeder` idempotente (solo admin + categorías); los datos y credenciales de prueba se
aislaron en `DatosPruebaSeeder`/`DatosMasivosSeeder`. Resuelve **S2**.

**Saneamiento 2026-09-15**: se corrigieron **E2** (historial de postulación con `users.id`
real), **E4** (contratación solo sobre postulación activa), **E6** (`total` de empresas con
`q`), **S11** (tope de `limite` en listados admin) y tres flujos de **E5** (transacciones
en perfil↔cuenta, usuario↔empresa y empresa↔usuario; queda pendiente oferta+habilidades).
Se agregó la regla de negocio **RN-21** (un admin no puede autodesactivarse) y se retiró el
filtro "Puesto o empresa" de la bolsa pública (`q` en `/api/ofertas` y
`/api/postulante/ofertas`). Se retiraron las dev-dependencies sin uso `fakerphp/faker` y
`mikey179/vfsstream`.

---

## A. Resumen general

El backend es una API REST bien estructurada para el portal de empleo municipal: capas Controller → Service → Repository → Model, autenticación JWT con rotación de refresh tokens y roles `admin | empresa | postulante`, respuesta JSON uniforme `{success, message, data}` / `{success, message, errors}`, validación centralizada (`app/Validation/Validador.php`) y errores de negocio serializados por `ApiExceptionHandler`.

**Lo que está sólido**: uso sistemático del query builder con parámetros (sin SQL injection confirmada), whitelist en todas las escrituras (sin mass assignment), verificación de propiedad (ownership) en todas las rutas por `id` (sin IDOR confirmado), hash bcrypt en todos los flujos, `.env` fuera de git, CORS por whitelist, subida de CV con validación real de MIME, firma binaria, estructura y tamaño acotados.

**Lo que requería atención en la revisión original (2026-09-08)**: una fuga de
`password_hash` en el listado admin de usuarios (**resuelta el 2026-09-10**), un
`usuario_id` incorrecto al registrar el historial inicial de postulaciones,
varias escrituras multi-tabla sin transacción, validaciones de fechas/rangos
inconsistentes y un modelo de "vigencia" de ofertas divergente entre consultas.
Consultar el cuadro de **Estado vigente** al inicio: E1–E6 y los hallazgos
F2/F4/F8–F13 ya están corregidos.

**En la fecha de la revisión original no se modificó el backend.** Este informe
conserva la evidencia histórica; las correcciones posteriores se registran en
las actualizaciones y en el cuadro de estado vigente.

---

## B. Arquitectura

Estructura de `app/`:

| Capa | Ubicación | Responsabilidad observada |
|---|---|---|
| Rutas | `app/Config/Routes.php` | Define la API bajo `/api`; grupos con filtros `cors`, `jwt`, `rol:*`. Auto-routing deshabilitado (`Config/Routing.php:97`). |
| Filtros | `app/Filters/JwtAuthFilter.php`, `RoleFilter.php` | Validan token, recargan usuario desde BD y validan estado `activo` (401/403). El rol se lee de BD, no del token. |
| Controladores | `app/Controllers/Api/**` | Delgados; resuelven sesión, leen `getJSON`/`getGet`, delegan en Services y responden con `ok/creado/sinContenido`. |
| Servicios | `app/Services/*.php` | Reglas de negocio, validación (`Validador`), transiciones de estado, auditoría, orquestación. |
| Repositorios | `app/Repositories/*.php` | Consultas SQL con joins (usuarios, empresas, ofertas, postulaciones, postulante, dashboard). |
| Modelos/Entidades | `app/Models`, `app/Entities` | Acceso a tablas y casting (p. ej. entidad `Cv` con `activo` → bool). |
| Validación | `app/Validation/Validador.php` | Reglas planas (`required/min/max/email/ruc/dni/regex/enum/igual`); lanza `ApiException` 422. |
| Excepciones | `app/Exceptions/ApiException.php`, `ApiExceptionHandler.php` | Envelope de error uniforme. Solo `ApiException` se enruta a este handler (`Config/Exceptions.php:102-109`). |
| Auditoría | `app/Services/AuditoriaService.php` | Inserta en `auditoria` (sin endpoint de lectura). |
| BD | `app/Database/Migrations`, `Seeds` | Migraciones ordenadas del esquema actual; catálogo y ER en `../docs/base-datos.md`. |

**Flujo general de una petición**:

1. `public/index.php` → router → grupo `api` (filtro `cors`).
2. Según el grupo: `JwtAuthFilter::before` exige `Authorization: Bearer`, decodifica (HS256), recarga el usuario por `sub` y valida `estado = activo`. `RoleFilter::before` compara el rol de BD contra los permitidos.
3. El Controller resuelve la identidad de la sesión (`service('guard')`) y lee entrada (`cuerpo()` = `getJSON(true)`; query con `getGet`).
4. El Service valida (Validador y reglas manuales), aplica reglas de negocio/transiciones y persiste vía Model/Repository; en flujos mutadores clave usa transacciones.
5. La respuesta se serializa como JSON uniforme. `ApiException` → handler con su código HTTP; cualquier otra excepción → 500.

**Particularidades que marcan el contrato**:
- `sinContenido()` responde **HTTP 200** con `data: null` (no usa 204). Todos los "PUT de éxito sin datos" son 200.
- Las acciones de estado usan `PUT /…/subruta`; no hay PATCH.
- No hay DELETE para entidades de negocio (desactivación); solo las secciones del perfil se eliminan físicamente.
- Controllers de rol empresa/postulante resuelven la entidad propia en el constructor; si no existe lanzan 404 en *toda* la clase.

---

## C. Endpoints

Se documentan **107 operaciones** en **89 rutas** (incluye raíz y `/health`). La
revisión original de 2026-09-08 documentó 75; el cuadro de **Estado vigente** al
inicio de este documento prevalece. Resumen por grupo (detalle completo en
`public/swagger/openapi.yaml`):

### Público (sin auth)

| Método | Ruta | Función |
|---|---|---|
| GET | `/` y `/health` | Información mínima y disponibilidad. |
| POST | `/api/auth/login`, `/api/auth/refresh`, `/api/auth/google` | Autenticación y renovación. |
| POST | `/api/registro/postulante`, `/api/verificar-dni` | Registro y verificación de DNI. |
| POST | `/api/verificar-ruc`, `/api/solicitudes-empresa` | Auto-registro empresarial con RUC. |
| GET/POST | `/api/activar-cuenta/{token}` | Validar y activar la cuenta empresarial. |
| GET | `/api/ofertas`, `/api/ofertas/{id}` | Bolsa pública y detalle. |
| GET | `/api/oportunidades`, `/api/actividades` | Difusión pública. |
| GET | `/api/actividades/{id}/imagen`, `/api/empresas/{id}/logo`, `/api/postulantes/{id}/foto` | Proxies de imágenes. |
| GET | `/api/categorias` | Catálogo de categorías. |

### Cualquier rol autenticado (`jwt`)

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/auth/me` | Usuario público de la sesión. |
| POST | `/api/auth/logout` | Revoca refresh tokens (200, no 204). |
| PUT | `/api/cuenta/contrasena` | Cambiar contraseña propia. |
| GET/PUT | `/api/cuenta/preferencias` | Preferencias de interfaz por usuario. |

### Rol `admin` (`/api/admin/*`)

| Recurso | Operaciones |
|---|---|
| `usuarios` | `GET /`, `POST /`, `GET /{id}`, `PUT /{id}`, `PUT /{id}/estado`, `PUT /{id}/password`, `PUT /{id}/perfil` |
| `empresas` | `GET /`, `POST /`, `GET /{id}`, `PUT /{id}`, `PUT /{id}/estado`, `PUT /{id}/password` |
| `solicitudes-empresa` | `GET /`, `GET /{id}`, `POST /{id}/aprobar`, `POST /{id}/rechazar`, `POST /{id}/reenviar`, `GET /{id}/enlace` |
| `dashboard` | `GET /`, `GET /pendientes`, `GET /empleabilidad` |
| `ofertas` | `GET /`, `GET /{id}`, `PUT /{id}/aprobar`, `PUT /{id}/rechazar`, `PUT /{id}/observar`, `PUT /{id}/cerrar` |
| `actividades` | `GET /`, `POST /`, `PUT /{id}`, `PUT /{id}/estado`, `POST /{id}/imagen`, `DELETE /{id}/imagen` |
| `oportunidades` | `GET /`, `POST /`, `PUT /{id}`, `PUT /{id}/estado`, `PUT /{id}/activacion` |
| `reportes` | `GET /`, `GET /csv`, `GET /excel`, `GET /pdf` |
| `contrataciones` | `GET /` |

### Rol `empresa` (`/api/empresa/*`)

| Recurso | Operaciones |
|---|---|
| `perfil` | `GET /`, `PUT /`, `PUT /presencia`, `POST /logo`, `DELETE /logo` |
| `dashboard` / `pendientes` | `GET /dashboard`, `GET /pendientes` |
| `ofertas` | `GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `PUT /{id}/enviar-revision`, `PUT /{id}/cerrar` |
| `postulaciones` | `GET /`, `GET /{id}`, `PUT /{id}/estado`, `PUT /{id}/activacion`, `GET /{id}/cv`, `GET /{id}/cv/archivo/{archivo}` |
| `contrataciones` | `GET /`, `GET /opciones`, `POST /`, `PUT /{id}` |
| `reportes` | `GET /excel`, `GET /pdf` |

### Rol `postulante` (`/api/postulante/*`)

| Recurso | Operaciones |
|---|---|
| `perfil` | `GET /`, `PUT /`, `POST /foto`, `DELETE /foto` |
| `dashboard` | `GET /` |
| `cv` | `GET /`, `POST /` (multipart `cv`), `GET /descargar`, `GET /archivo/{archivo}` |
| `ofertas` | `GET /` (búsqueda), `GET /{id}` |
| `postulaciones` | `GET /`, `POST /`, `PUT /{id}/retirar` |

**Endpoints inexistentes**: no hay `GET` de detalle individual para
actividades, oportunidades ni contrataciones (solo listados y `PUT`/acciones).
No hay borrado físico de ofertas, postulaciones ni contrataciones. No hay
endpoint de lectura de auditoría.

## D. OpenAPI / Swagger

- **Archivo generado**: `backend/public/swagger/openapi.yaml`.
- **Ubicación**: dentro del docroot (`public/`) para poder servirse en `http://localhost:8080/swagger/` sin tocar rutas del backend.
- **Versión OpenAPI**: `3.0.3`. Idioma de descripciones: español.
- **Endpoints documentados**: 107 operaciones en 89 rutas, correspondientes 1:1 a
  `app/Config/Routes.php` (incluye raíz, `/health` y las rutas de imágenes,
  preferencias y pendientes incorporadas después de la revisión original).
- **Schemas creados** (en `components.schemas`): envelope de éxito/error, usuario (público, detalle, fila de listado admin — **ya sin `password_hash`**), sesión, empresa (fila/detalle/crear/actualizar/perfil y presencia), oferta (fila/detalle/crear/rechazo), categoría, actividad, oportunidad, contratación (fila/crear/actualizar/opción), postulación (postulante/empresa/detalle/estado), CV (vigente/historial/subida), dashboards (admin/empresa/postulante), preferencias y contadores. Los schemas de atenciones y de perfil por secciones se retiraron junto con esos módulos.
- **Autenticación documentada**: `securitySchemes.bearerAuth` (JWT HS256) + seguridad por operación; roles por grupo indicados en descripción.
- **Swagger UI**: `backend/public/swagger/index.html` (CDN de Swagger UI 5), carga `./openapi.yaml`, permite "Authorize" con el Bearer token. **Lista** para verse en `http://localhost:8080/swagger/` (el archivo YAML debe servirse junto al HTML; en despliegue conviene restringir o eliminar esta carpeta si no se desea exponer la documentación).
- **Validación realizada**:
  - Sintaxis YAML y estructura 3.x: OK (parseo con PyYAML).
  - `$ref`: todos apuntan a componentes existentes (verificador propio, sin errores).
  - `operationId`: 107 únicos.
  - Métodos HTTP vs rutas reales: cruce contra `Routes.php` — cobertura total.
  - Parámetros/bodies vs controladores/validador: revisados archivo por archivo.
  - `@redocly/cli lint`: **no pudo ejecutarse** por caída de red en el entorno; se dejó un validador offline reutilizable en `public/swagger/_validate_openapi.py` y `docs/_validate_openapi.py`. Estas utilidades de documentación no forman parte del flujo oficial y deben ejecutarse en un contenedor de herramientas, no como dependencias del host.
- **Comportamientos no obvios documentados explícitamente**: 200 en `sinContenido`, cast de booleanos (`(bool)"false" === true`), 404 anti-enumeración para recursos ajenos, `limite/offset` solo en 2 endpoints, driver `supabase` vs `local` para CV, códigos y mensajes reales.

---

## E. Problemas críticos y altos

| # | Problema | Severidad | Evidencia | Impacto | Recomendación |
|---|---|---|---|---|---|
| E1 | **RESUELTO (2026-09-10)** — **`password_hash` expuesto en listado de usuarios** | CRÍTICO | `app/Repositories/UsuarioRepository.php:49-50` (`select('users.*')` + `getResultArray`) → `GET /api/admin/usuarios` | Hashes bcrypt de todos los usuarios salen en JSON (admin-only, pero no deben salir jamás; quedan en logs/red). El detalle (`UsuarioService::detallado`, `:173-186`) sí hace whitelist. | Seleccionar columnas explícitas sin `password_hash` (o recorrer con whitelist) en `UsuarioRepository::base()`/`listar()`. |
| E2 | **RESUELTO (2026-09-15)** — **`postulacion_historial.usuario_id` guarda `postulantes.id` (clave de otro dominio)** | ALTO | `app/Services/PostulacionService.php:105` escribe `usuario_id => $postulanteId`; la FK apunta a `users.id` (`Migrations/2026-09-03-100003…:112`). En cambio el historial de la empresa sí guarda el `users.id` real (`:188`). | La trazabilidad inicial de toda postulación queda corrupta: puede apuntar a un usuario equivocado o violar la FK (fallo de transacción → 409). `postulantes.id` y `users.id` son secuencias independientes. | Guardar el `user_id` real del postulante (resolver vía `postulantes.user_id`) en el insert de historial. |
| E3 | **RESUELTO (2026-11-02)** — **Aprobar oferta no revalida `fecha_cierre`** | ALTO | `app/Services/OfertaService.php:210-223` (no chequea vigencia) vs `OfertaRepository::publicadas` (`:64-66` excluye vencidas) | Una oferta pendiente aprobada con fecha de cierre vencida queda `publicada` pero invisible/no postulable: estado de BD y vigencia divergen. | Al aprobar, validar `fecha_cierre >= hoy` (o rechazar/avisar). |
| E4 | **RESUELTO (2026-09-15)** — **Contratación registrable sobre postulación inactiva** | ALTO | `app/Services/ContratacionService.php:81-84,131-145` valida solo `estado = seleccionado`; no exige `activo`. `opcionesDeEmpresa` sí exige `activo=1` (`:48`). | Se puede contratar a un candidato cuya postulación fue retirada/desactivada; inconsistencia entre "opciones" y el alta directa. | Exigir `activo = 1` en `postulacionDeEmpresa()`/`registrar()`. |
| E5 | **RESUELTO (2026-11-02)** — **Escrituras multi-tabla sin transacción** | ALTO | `PostulanteService::actualizarBasico` (`:67-80`, postulantes+users), `EmpresaService::cambiarEstado` (`:184-185`), `UsuarioService::cambiarEstado` (`:137-142`), `OfertaService::crear/actualizar` (oferta + habilidades, `:105-157`) | Fallo a mitad de camino deja datos divergentes (perfil vs cuenta, users vs empresas, oferta sin habilidades). | Envolver en `transStart/transComplete` + `transStatus`. |
| E6 | **RESUELTO (2026-09-15)** — **`total` de paginación de empresas ignora `q`** | ALTO | `EmpresaRepository::contar` (`:47-56`) no aplica el filtro `q` (a diferencia de `UsuarioRepository::contar`, `:39-45` que sí aplica todos) | El frontend paginando con búsqueda ve `total` mayor a la cantidad real de filas. | Aplicar los mismos filtros en `contar()` (o paginar de una sola consulta). |

---

## F. Bugs medios y bajos

| # | Problema | Severidad | Evidencia | Impacto / reproducción | Recomendación |
|---|---|---|---|---|---|
| F1 | Sync `users.estado ↔ empresas.estado` con doble dueño y sin transacción | MEDIO | `EmpresaService::cambiarEstado` (`:184-185`) vs `UsuarioService::cambiarEstado` (`:137-142`); runtime solo mira `users.estado` (JwtAuthFilter `:35`), métricas usan `empresas.estado` | Estado de bloqueo ≠ métrica; fallo parcial desincroniza. Repro: desactivar por un endpoint y por el otro. | Un solo endpoint/owner + transacción. |
| F2 | **RESUELTO (2026-11-02)** — Usuario empresa desactualizado al editar la empresa | MEDIO | `EmpresaService::actualizar`/`actualizarPropia` (`:156-164`, `:233-239`) no tocan `users` (nombres/email/telefono se poblaron al crear) | Pantallas de admin/usuarios muestran datos viejos tras editar email/razón social. | Sincronizar campos en `users` o dejar solo una fuente. |
| F2b | Fecha/hora fija `08:00:00` al crear atenciones/actividades | MEDIO | `AtencionService::normalizarFecha` (`:138-148`), `ActividadService::normalizar` (`:120-123`) | Un rango `desde/hasta` (que compara `00:00:00`–`23:59:59`) puede excluir registros creados con solo fecha (guardados a las 08:00). | Normalizar a 00:00:00 o al rango correcto. |
| F3 | Rangos `desde/hasta` sin validar en 2 endpoints | MEDIO | `AtencionService::listar` (`:47-52`), `ContratacionService::listarGlobal` (`:62-67`, usado por `GET /admin/contrataciones`) | Formato inválido → error SQL → 500, o filtros con fechas coercidas (`strictOn=false`) devuelven filas indebidas. | Reusar la validación de `DashboardService::validarRango`. |
| F4 | **RESUELTO (2026-11-02)** — `(bool)` sobre strings en `activo` | MEDIO | `OportunidadesController::activacion` (`:41`), `Empresa/PostulacionesController::activacion` (`:60`) | `(bool)"false" === true` en PHP: desactivar enviando `"false"` **activa**. | Documentar (hecho) y en el backend tipar estricto. |
| F5 | Re-postular tras retirar crea duplicados visibles + historial huérfano | MEDIO | `PostulacionService::retirar` (`:117-129`) deja `activo=0`; `postular` solo bloquea activas (`:79-86`) | El candidato puede aparecer 2 veces (1 inactiva + 1 nueva) para la misma oferta/empresa. | Política explícita de re-postulación (reactivar vs crear nueva). |
| F6 | `tiempo_promedio_*` truncado a días enteros y con subconsulta sobre todo el historial | MEDIO | `DashboardRepository.php:107-125` (`TIMESTAMPDIFF(DAY, …)`) | Respuestas < 24 h = 0 días; sesgo si el evento "contactado" ocurre fuera del rango (solo filtra `fecha_postulacion`). | Usar horas decimales y acotar la subconsulta al rango. |
| F7 | Sin cierre automático de ofertas vencidas | MEDIO | `OfertaService::cerrar` manual (`:174-183`); nadie transiciona por vencimiento | Bandejas/dashboards cuentan ofertas vencidas como `publicada`. | Tarea programada/consulta de reconciliación. |
| F8 | **RESUELTO (2026-11-02)** — `detallePublica` no valida vigencia | MEDIO | `OfertaService.php:63-79` | Oferta vencida accesible por URL directa con detalle completo aunque no figure en la búsqueda. | Validar `fecha_cierre`. |
| F9 | **RESUELTO (2026-11-02)** — Actividades `programado` con fecha pasada siguen "públicas" | BAJO | `ActividadService.php:43-53` (`soloPublicas` no filtra fecha) | Divulgación muestra ferias ya realizadas. | Filtrar por `fecha_inicio >= hoy`. |
| F10 | **RESUELTO (2026-11-02)** — Rechazo de oferta no registra `validado_por`/`fecha_validacion` | BAJO | `OfertaService.php:233-236` vs `aprobar` (`:215-221`) | Sin quién/cuándo rechazó en la tabla. | Registrar en rechazo. |
| F11 | **RESUELTO (2026-11-02)** — Orden alfabético de la bandeja admin de ofertas | BAJO | `OfertaRepository.php:41` (`estado ASC`) | `borrador, cerrada, pendiente, publicada, rechazada`: no prioriza pendientes. | `FIELD`/prioridad de negocio. |
| F12 | **RESUELTO (2026-11-02)** — `required` acepta cadenas de solo espacios | BAJO | `Validador.php:29` | `nombres: "   "` pasa validación. | `trim()` previo o regla. |
| F13 | **RESUELTO (2026-11-02)** — `strtotime` normaliza fechas imposibles | BAJO | `OfertaService.php:298`, `AtencionService.php:121`, `PostulanteService.php:234-242`, `DashboardService.php:79` | `2026-02-31` "pasa" como fecha (regex no valida calendario). | Validación calendárica (`checkdate`). |
| F14 | Asimetría `listado` vs `detalle` | BAJO | `GET /admin/ofertas` sin `habilidades/cantidad` (`OfertaRepository.php:38-49`) vs detalle (`:95-109`); igual en ofertas de empresa | El frontend debe manejar campos distintos según endpoint. | Documentado en OpenAPI; unificar si conviene. |
| F15 | `Empresa/PostulacionesController` lista activas e inactivas sin distinción | BAJO | `PostulacionRepository.php:40-58` (sin filtro `activo`) | "Postulaciones recibidas" mezcla retiradas. | Considerar filtro/flag. |
| F16 | Auditoría parcial e inconsistente | MEDIO | Se audita login, cambio de contraseña, aprobar/rechazar oferta y módulo admin (usuario/empresa). **No se auditan**: registro postulante, ofertas crear/editar/envío/cierre, postulaciones, CV (dato sensible), atenciones, actividades, oportunidades, contrataciones | Sin trazabilidad de acciones relevantes. No hay endpoint de lectura. | Definir matriz de auditoría y completar. |
| F17 | Detalle JSON de auditoría sin límite y `json_encode` fallido silencioso | BAJO | `AuditoriaService.php:23-39` | Crecimiento/`null` silencioso. | Acotar y manejar error. |

---

## G. Problemas de seguridad

| # | Clasificación | Problema | Evidencia | Comentario |
|---|---|---|---|---|
| S1 | **RESUELTO (2026-09-10)** | Exposición de `password_hash` en `GET /api/admin/usuarios` | `UsuarioRepository.php:49-50` | Corregido con `SELECT` explícito de columnas seguras (sin `password_hash`). Ver E1. |
| S2 | **RESUELTO (2026-09-10)** | Credenciales conocidas en seeder | `Seeds/SystemSeeder.php` ya no contiene credenciales: el admin inicial (`MDJLO-SOL`) se provisiona desde `INITIAL_ADMIN_*` del `.env` y se guarda con hash; las credenciales de prueba (`Admin123!`, `Empresa123!`, `Postu123!`) se movieron a `Seeds/DatosPruebaSeeder.php` (solo fixtures de testing). | Cambiar la contraseña inicial tras el primer acceso. |
| S3 | CONFIRMADO (baja) | Interpolación SQL en subconsulta (hoy con constantes internas) | `DashboardRepository.php:112` (`estado_nuevo = "' . $estado . '"`) | Seguro hoy (solo `contactado`/`seleccionado`); parametrizar/validar si se conecta a input. |
| S4 | **RESUELTO (2026-09-10)** | Sin rate-limiting en login/refresh (públicos) | `AuthController.php:24-61` | Implementado con Throttler de CI4 (token bucket): login 5 tokens/300 s por IP+usuario (solo fallos) y refresh/Google/registro 10/300 s por IP (`ThrottleFilter` + `AuthService`); responde `429` + `Retry-After` (≈ intervalo, no ventana fija). |
| S5 | RECOMENDACIÓN | Access token válido tras logout (sin blacklist) | `AuthService.php:111-114` | Aceptable por diseño; documentado. |
| S6 | RECOMENDACIÓN | Reuso de refresh token no revoca la familia | `AuthService.php:66-85` | Rotación existe; endurecer con `revocarTodos` ante reuso. |
| S7 | **RESUELTO (2026-11-02)** | JWT firmado con secreto vacío si falta `jwt.secret` | `JwtService.php:21` | Validar/fail-fast. |
| S8 | **RESUELTO (2026-11-02)** | MIME de CV confiado al cliente (sin magic bytes) | `CvService.php:129-141` | Contenido-hostil improbable (se sirve como attachment); endurecer con `%PDF` etc. |
| S9 | RECOMENDACIÓN | `object_key` interno del CV en respuestas JSON | `PostulanteRepository.php:44-55`, `PostulacionService.php:157` | Bajo riesgo; filtrar. |
| S10 | RECOMENDACIÓN | Enumeración por mensajes en registro público | `AuthService.php:132-137` | Mensaje genérico. |
| S11 | **RESUELTO (2026-09-15)** | `limite` sin tope en listados admin | `UsuariosController.php`, `EmpresasController.php`, `SolicitudesEmpresaController.php` | Acotado a 1–200 con `offset` >= 0. |
| S12 | **RESUELTO (2026-09-10)** | Trazas en errores no controlados si el entorno es `development` y sin HTTPS forzado | `.env` local (`CI_ENVIRONMENT=development`, `forceGlobalSecureRequests=false`), `Config/Exceptions.php:102-109` | `ApiExceptionHandler` responde mensaje genérico en `500` y registra el detalle solo en el log; confirmar igualmente HTTPS/entorno en despliegue (`.env.example` y `docs/operaciones.md`). |
| S13 | RECOMENDACIÓN | CORS default de desarrollo | `Config/Cors.php:52` (`http://localhost:5173`) | Mantener `cors.allowedOrigins` coherente con el frontend local. |
| S14 | **RESUELTO POR ARQUITECTURA (2026-11-02)** | IP auditada tras proxy | `AuditoriaService.php:26-29`, `App.php:183` (`proxyIPs=[]`) | Configurar `proxyIPs`. |

**Revisados y limpios**: SQL injection (query builder parametrizado en todas las consultas revisadas); mass assignment (todas las escrituras usan whitelists/arrays fijos); IDOR/BOLA (ownership verificado por sesión en cada ruta con `{id}`; recursos ajenos → 404); hash de contraseñas (bcrypt + `password_verify`, sin md5/plain); `.env` ignorado por git; subida de CV (extensión/MIME/tamaño, nombres generados por el servidor, `writable/uploads` no servido estáticamente); CORS sin wildcard; CSRF desactivado (correcto para API stateless Bearer).

---

## H. Problemas de base de datos

| # | Problema | Evidencia | Recomendación |
|---|---|---|---|
| H1 | Sin índice para consultas por `oferta_id` en `postulaciones` | Migración `100003…:81-83` (índices `(empresa_id,estado,fecha)` y `(postulante_id,activo)`; sin `oferta_id`) usado en `OfertaRepository.php:103-106` | Índice `(oferta_id, activo)`. |
| H2 | `postulacion_historial.usuario_id` con FK a `users` pero datos de `postulantes` | Ver E2 | Corregir origen de datos (no esquema). |
| H3 | `LIKE '%q%'` en varias búsquedas (sin índice utilizable) | `UsuarioRepository.php:66-73`, `EmpresaRepository.php:34-38`, `AtencionService.php:53-60`, `OfertaRepository.php:70-86` | Aceptable a volumen actual; full-text si crece. |
| H4 | `empresas.estado` vs `users.estado` (estado duplicado sincronizado manualmente) | Migraciones `100001…:25` y `100002…:28` | Fuente única o sync transaccional (E/F). |
| H5 | Columnas generadas `postulacion_unica` VIRTUAL para RN-14 | Migración `100003…:92-97` | Bien implementado (VIRTUAL evita error 1215). Revisar cobertura con re-postulaciones (F5). |
| H6 | `atenciones.fecha` guardada con hora fija (08:00) al pasar solo fecha | `AtencionService.php:143-145` | Coherente con filtros de rango (F2b). |
| H7 | DECIMAL devuelto como cadena | MySQLi/mysqlnd devuelve DECIMAL como string | Documentado en OpenAPI; el frontend debe parsearlo. |
| H8 | Tipos de columna VARCHAR para estados/roles no ENUM en `postulacion_historial` (`:104-105`) vs ENUM en tablas origen | Migración `100003…:104-105` | Inconsistencia menor; no rompe por valores controlados. |
| H9 | Sin índice para `atenciones.persona_nombre`/búsquedas ni para `usuarios` por rol+estado | Migración `100001…:59` (índice `(user_id, created_at)` en auditoría) | Evaluar según volumen. |
| H10 | **RESUELTO (2026-11-02)** — Zona horaria de negocio | `Config/App.php` usa `appTimezone='America/Lima'`; fechas y rangos se calculan en esa zona y está cubierto por pruebas. | No requiere acción. |

**Integridad referencial**: FKs presentes y coherentes entre tablas (con `CASCADE`/`SET NULL` razonables). Las migraciones, modelos y seeds son consistentes entre sí; no hay un esquema SQL separado que comparar. El seeder referencia `user_id=2`/`3` y `empresa_id=1`/`postulante_id=1` acoplado al orden de inserción (frágil si se modifica).

---

## I. Problemas de rendimiento

| # | Problema | Evidencia | Impacto / recomendación |
|---|---|---|---|
| R1 | **N+1** en `listarMias` (empresa) | `OfertaService.php:83-88` (1 query de habilidades por oferta) | 200 ofertas ≈ 200+ queries. Usar `GROUP_CONCAT`/join agregado o cache de habilidades por empresa. |
| R2 | `detalle()` de ofertas ejecuta 2 queries extra en cada validación de estado | `OfertaRepository.php:95-109` usado por `exigirPropia`/`exigirPendiente` | Overload "ligero" para solo propiedad/estado. |
| R3 | `perfilCompleto` = 6 consultas por llamada | `PostulanteRepository.php:23-59` | Aceptable por request; vigilar uso en detalle de postulación. |
| R4 | Listados con topes fijos silenciosos (sin paginación) | 300 (`AtencionService`, `ContratacionService`, `OportunidadService`, `PostulacionRepository::deEmpresa`), 200 (`ActividadService`, `OfertaRepository::publicadas`), sin tope (ofertas admin/empresa) | Pérdida silenciosa de filas; datos incompletos en el frontend. Definir paginación consistente. |
| R5 | Dashboard admin ~9 consultas (2 con subquery sobre todo el historial) | `DashboardRepository.php:23-101` | Optimizar si el volumen crece. |
| R6 | `UsuarioRepository::contar` reutiliza joins completos para contar | `UsuarioRepository.php:39-45` (`base()` con 2 LEFT JOIN) | Contar sin joins (o `COUNT` con `EXISTS`). |
| R7 | Archivos enteros en memoria para CV | `StorageService.php:64`, `CvController.php:89`, `Empresa/PostulacionesController.php:84` | Tope 5 MB lo hace tolerable; streams para más. |
| R8 | `data` pesado en respuestas de detalle (perfil completo dentro de cada postulación) | `PostulacionService.php:157` | El frontend recibe el perfil completo con CV por postulación; evaluar vistas reducidas. |

---

## J. Problemas de calidad / mantenibilidad

| # | Problema | Detalle |
|---|---|---|
| Q1 | Duplicación de enums de estados sin fuente única | Los 6 estados de postulación viven en `PostulacionService.php:39-45`, `PostulacionRepository.php:50`, `DashboardRepository.php:33,138,169`, `Controllers/Api/Empresa/PostulacionesController.php:17`; los 5 de oferta en `OfertaService.php:189` y `DashboardRepository.php:28,132`. Cualquier cambio obliga a tocar 5+ archivos. |
| Q2 | Lógica SQL repartida entre Services y Repositories sin criterio único | Services con SQL directo (`AtencionService`, `ContratacionService`, `OportunidadService`, `PostulanteService`, `OfertaService` usando `db->table`) junto a Repositories. ~30 usos de `db->table` en Services. |
| Q3 | Services espejo empresa/usuario | `EmpresaService` vs `UsuarioService` duplican estado + reset de contraseña sobre la misma entidad (`:172-200` vs `:125-158`). |
| Q4 | Validación del mismo concepto en lugares distintos | `estado` de ofertas validado en Service (`OfertaService.php:189-192`); `estado` de postulaciones en Controller (`Empresa/PostulacionesController.php:37-39`) y Service (`PostulacionService.php:171-176`); filtros de empresa/usuario/actividad sin validar. |
| Q5 | Solo 1 try/catch y 1 log en toda la app; retornos `false` de updates no verificados | `JwtService.php:47`, `StorageService.php:217` | Con `DBDebug=false`, fallos de BD silenciosos en varios flujos. |
| Q6 | Fechas/hora: 3 implementaciones distintas de "comparar fecha con hoy" y 2 de normalizar fechas | `OfertaService.php:302`, `PostulacionService.php:74`, `OfertaRepository.php:65`; `ActividadService`/`AtencionService`. | |
| Q7 | Nomenclatura: rutas mixtas EN/ES | `/cuenta/contrasena` (ES) vs `/usuarios/{id}/password` (EN); método `resetPassword` en subruta `password`. | |
| Q8 | **RESUELTO (2026-09-10)** — Excepción no-ApiException se envuelve en 500 con mensaje crudo | `ApiExceptionHandler.php:29-31` | Ahora toda excepción HTTP pasa por el handler JSON y los `500` usan un mensaje genérico con log interno; ya no filtra internos. |
| Q9 | `ReportesController` recalcula indicadores que ya produce el repository (duplicación dashboard/reporte) | `ReportesController.php:20-24,41-45` | |
| Q10 | Falta de GET de detalle en varios módulos | actividades/oportunidades/contrataciones | El frontend no puede ver una entidad individual; se usan listados y modales. |

Puntos a favor: controladores delgados, docblocks con referencias RF/RN/RT, nombres en español consistentes, arquitectura por capas razonable para el propósito, validación centralizada y envelope uniforme.

---

## K. Inconsistencias entre componentes

| # | Inconsistencia | Dónde |
|---|---|---|
| K1 | **RESUELTO (2026-09-10)** — Listado admin de usuarios exponía `password_hash`; detalle no | `UsuarioRepository.php:50` vs `UsuarioService.php:173-186` (E1); ahora ambos sin hash. |
| K2 | `usuario_id` de historial: postulaciones nuevas usan `postulantes.id`, cambios de empresa usan `users.id` | `PostulacionService.php:105` vs `:188` (E2). |
| K3 | "Vigencia" de oferta: `publicada` ≠ postulable (sin reconciliación con `fecha_cierre`) | `OfertaService.php:210-223` vs `OfertaRepository.php:59-90` y `detallePublica`. |
| K4 | Contratación: lista de opciones exige `activo=1`; el alta directa no | `ContratacionService.php:48` vs `:81-84` (E4). |
| K5 | `users.estado` vs `empresas.estado` como fuente de verdad según consulta | JwtAuthFilter vs DashboardRepository (E/F). |
| K6 | `contar()` con filtros distintos entre empresas y usuarios | `EmpresaRepository.php:47-56` vs `UsuarioRepository.php:39-45` (E6). |
| K7 | Rangos validados en dashboard/reportes, no en contrataciones/atenciones | `DashboardService.php:71-84` vs `AtencionService.php:47-52`/`ContratacionService.php:62-67`. |
| K8 | `sinContenido()` (nombre) responde 200, no 204 | `BaseApiController.php:34-37`. |
| K9 | Campo `activo` en CV: int en arrays crudos, bool en entidad `Cv` | `PostulanteRepository.php:50-56` (int) vs `CvController.php:36-40` (bool). |
| K10 | **RESUELTO (2026-11-02)** — Fechas/rangos en `America/Lima` | `Config/App.php` y validaciones de fechas. |
| K11 | Tipo DECIMAL devuelto como cadena; campos `activo` como int | Driver MySQLi/mysqlnd. Documentado en OpenAPI. |

---

## L. Lista priorizada de correcciones

Formato: (1) Problema · (2) Severidad · (3) Archivo/componente · (4) Impacto · (5) Acción recomendada

### Antes de conectar el frontend
1. ~~Fuga de `password_hash` en listado de usuarios~~ · **RESUELTO (2026-09-10)** · `Repositories/UsuarioRepository.php:50` · Se seleccionan columnas explícitas sin `password_hash` (E1).
2. `usuario_id` erróneo en historial de postulaciones · ALTO · `Services/PostulacionService.php:105` · Trazabilidad corrupta/FK rota (E2) · Guardar `postulantes.user_id`.
3. Aprobar oferta sin revalidar `fecha_cierre` · ALTO · `Services/OfertaService.php:210-223` · Ofertas "publicadas" muertas (E3) · Validar vigencia al aprobar.
4. Contratación sobre postulación inactiva · ALTO · `Services/ContratacionService.php:131-145` · Datos inconsistentes (E4) · Exigir `activo=1`.
5. Transacciones faltantes en escrituras multi-tabla · ALTO · `Services/PostulanteService.php:67-80`, `EmpresaService.php:184-185`, `UsuarioService.php:137-142`, `OfertaService.php:105-157` · Divergencia parcial (E5) · Envolver en transacciones.
6. `total` de empresas con `q` incorrecto · ALTO · `Repositories/EmpresaRepository.php:47-56` · Paginación rota al buscar (E6) · Aplicar filtros en `contar()`.
7. Tipos/respuestas discrepantes para el frontend · MEDIO · varios · `limite/offset` solo en 2 endpoints, `total` anidado, DECIMAL como cadena, campos distintos listado vs detalle, CV dual según driver, cast booleano · Leer `openapi.yaml` como contrato y alinear el cliente; ver sección K.

### Después de estabilizar
8. Unificar dueño de `users.estado`/`empresas.estado` · MEDIO · `EmpresaService`/`UsuarioService` · Desincronización · Un endpoint + transacción.
9. Validación de rangos de fecha en atenciones/contrataciones · MEDIO · `AtencionService`, `ContratacionService` · Errores 500/filtros inválidos · Reusar `validarRango`.
10. Normalizar fecha/hora (08:00) · MEDIO · `AtencionService`, `ActividadService` · Registros fuera de rangos · Unificar convención de hora.
11. Cierre/vencimiento de ofertas · MEDIO · `OfertaService`/nuevo proceso · Ofertas vencidas como publicadas · Reconciliación programada o filtro por fecha en bandejas.
12. Cobertura de auditoría · MEDIO · Services mutadores · Sin trazabilidad · Matriz de auditoría y completar flujos.
13. Rate-limit en login/refresh · RECOMENDACIÓN · `AuthController` · Fuerza bruta · Throttling.
14. Secreto JWT vacío fail-fast · BAJO · `JwtService.php:21` · Tokens forjables si falta env · Validar en boot.
15. Enums únicos (postulación/oferta) · BAJO · 5+ archivos · Divergencia futura · Constantes compartidas.
16. Reuso de refresh token → revocar familia · BAJO · `AuthService.php:66-85` · Endurecimiento.
17. Índice `postulaciones(oferta_id, activo)` · BAJO · Migración 100003 · Consultas de detalle/cantidad · Nueva migración.
18. Zona horaria Perú · MEDIO · `Config/App.php:136` + MySQL · Fechas corridas ~5 h · Definir y fijar `timezone` app+MySQL y documentar.
19. MIME por contenido en CV · BAJO · `CvService.php:129-141` · Validación de magic bytes.
20. Limpieza de `object_key` en respuestas · BAJO · `PostulanteRepository.php:44-55` · Exposición interna.

---

## M. Estado final

**Qué está funcionando correctamente**
- API REST coherente: rutas explícitas (auto-routing off), controladores delgados, envelope único, validación centralizada, errores serializados.
- Autenticación robusta: JWT HS256, expiración, recarga de usuario/rol/estado desde BD por request, refresh tokens de 256 bits con hash SHA-256 y rotación.
- Seguridad de base: sin SQLi ni mass assignment confirmados, ownership verificado (sin IDOR), bcrypt en todos los flujos, `.env` no versionado, CORS whitelist, subida de archivos validada.
- Modelo de datos: esquema actual con usuarios, empresas, postulantes, ofertas, postulaciones, contrataciones, actividades, oportunidades, CV, identidades y rate limiting; FKs, índices y migraciones ordenadas.
- La especificación OpenAPI generada cubre el 100% de las rutas reales y describe el comportamiento no obvio.

**Qué requiere atención (histórico)** → la lista L-1..L-7 del informe original
se conserva como trazabilidad. A 2026-11-02, E1–E6 y los hallazgos F2, F4,
F8–F13 están resueltos; consulte el cuadro de **Estado vigente** al inicio de
este documento. Las recomendaciones no bloqueantes restantes son cobertura de
auditoría, métricas/N+1, índices y política de re-postulación.

**Qué puede ir a una fase posterior**: ampliación de auditoría, optimización de
consultas N+1, índices adicionales y otras mejoras de observabilidad.

**Documentación**: la API queda documentada al 100% en `public/swagger/openapi.yaml` (OpenAPI 3.0.3) con Swagger UI en `public/swagger/index.html`, describiendo la API **real** (incluye hallazgos señalados como tales, no como "correcciones"). La validación sintáctica/estructural offline pasó; el lint `@redocly/cli` no pudo ejecutarse en esta sesión por falta de red. Si se necesita, ejecute el lint o el validador `public/swagger/_validate_openapi.py` en un contenedor de herramientas; no instale Node/Python en el host para el flujo oficial.

**Verificaciones pendientes de runtime** (no ejecutables en esta sesión sin BD/credenciales): comprobación de respuestas reales con Thunder Client/Postman y persistencia por SQL. Si al probar el frontend se encuentra una discrepancia entre lo aquí documentado y lo respondido, registrarla como hallazgo y revisar el origen en el backend (no "forzar" el cliente).
