# Auditoría integral de rendimiento y N+1 — SOL

**Fecha:** 2026-11-11
**Rama de trabajo:** `main` (integración directa solicitada)
**Alcance:** frontend React, API CodeIgniter, MariaDB 11.4.13 y almacenamiento de imágenes/CV.
**Dictamen:** **APROBADO CON OBSERVACIONES** (ver sección I).

---

## A. Resumen ejecutivo

Se auditó la ruta completa navegador → React Query → API → servicios/repositorios → MariaDB → serialización → navegador. Se encontró y corrigió **un N+1 SQL crítico** en la bandeja de ofertas de la empresa y **dos consultas redundantes** en detalle y dashboard. Además se eliminaron revalidaciones HTTP innecesarias al remontar pantallas y se evitó el saneamiento HTML repetido en cada render.

Resultado principal, con 30 muestras por escala y datos sintéticos en MariaDB temporal:

| Escala | Antes (consultas) | Después (consultas) | Antes (mediana) | Después (mediana) | Mejora |
|---|---:|---:|---:|---:|---:|
| 10 ofertas | 14 | 4 | 15,55 ms | 11,85 ms | −23,8 % |
| 100 ofertas | 104 | 4 | 53,03 ms | 13,37 ms | **−74,8 % de latencia** |

El número de consultas del listado de la empresa pasó de crecer linealmente con las ofertas a ser constante. El detalle de oferta pasó de 3 a 2 consultas y el dashboard municipal de 10 a 9. No se añadieron índices, dependencias ni cachés de datos sensibles. La instrumentación `PERF_DIAGNOSTICS` quedó desactivada por defecto.

---

## B. Inventario cubierto

### Rutas y módulos inspeccionados

| Contexto | Módulos / endpoints revisados |
|---|---|
| Público | `/health`, `/api/ofertas`, `/api/ofertas/{id}`, `/api/actividades`, `/api/oportunidades`, `/api/categorias`, imágenes de actividad/empresa/postulante, login, registro, activación, DNI/RUC con mock |
| Administración | dashboard, pendientes, empleabilidad, ofertas (listado/detalle/revisión), actividades (listado/imagen), difusión, contrataciones, usuarios, empresas, solicitudes, reportes Excel/PDF/CSV |
| Perfiles municipales | `admin`, `moderador`, `solo_lectura`; matriz de `AutorizacionMunicipalService` verificada por pruebas existentes |
| Empresa | perfil, presencia, logo, dashboard, pendientes, ofertas, postulaciones, CV, contrataciones, reportes |
| Postulante | buscar empleo, detalle, postulaciones, perfil, foto, CV, oportunidades, cuenta |

### Archivos revisados (principales)

- `backend/app/Services/*` y `backend/app/Repositories/*`.
- `backend/app/Controllers/Api/**` y `backend/app/Config/Routes.php`.
- `backend/app/Models/OfertaHabilidadModel.php`.
- `frontend/src/services/*`, `frontend/src/pages/**`, `frontend/src/layouts/**`.
- `frontend/src/components/ContenidoEnriquecido.jsx`, `ProfileImage.jsx`, `RedesSociales.jsx`.
- `backend/app/Services/StorageService.php`, `ImageService.php`, `DivulgacionController.php`.
- Migraciones e índices de MariaDB.

### Endpoints medidos

`/api/empresa/ofertas`, `/api/empresa/postulaciones`, `/api/empresa/contrataciones`, `/api/admin/ofertas`, `/api/admin/empresas`, `/api/admin/dashboard`, `/api/admin/empleabilidad`, `/api/postulante/postulaciones`, `/api/postulante/perfil`, `/api/ofertas`, `/api/ofertas/{id}`, `/api/actividades`, `/api/oportunidades`, `/api/categorias`.

---

## C. Hallazgos

| ID | Prioridad | Archivo / línea | Endpoint o módulo | Tipo | Medición | Causa raíz |
|---|---|---|---|---|---|---|
| PF-01 | **P0** | `backend/app/Services/OfertaService.php:164`; `backend/app/Models/OfertaHabilidadModel.php:40` | `GET /api/empresa/ofertas` | N+1 SQL | 10 ofertas: 14 consultas; 100: 104 consultas | `listarMias()` llamaba `deOferta()` por cada fila dentro de `array_map` |
| PF-02 | P1 | `backend/app/Repositories/OfertaRepository.php:135` | `GET /api/ofertas/{id}` | Consulta redundante | 3 consultas → 2 | El conteo de postulaciones se ejecutaba en una consulta separada del detalle |
| PF-03 | P1 | `backend/app/Repositories/DashboardRepository.php:147` | `GET /api/admin/dashboard` | Agregación duplicada | 10 consultas → 9 | Dos `AVG` sobre la misma tabla de historial en consultas independientes |
| PF-04 | P2 | `frontend/src/App.jsx:17` | Navegación cliente (postulante/admin) | Solicitudes HTTP redundantes | Volver a Buscar: 4 solicitudes → 0; volver a Dashboard: 2 → 0; postulaciones: 2 → 0 | `staleTime` por defecto 0: cada remontaje de layout/página volvía a pedir datos ya cargados |
| PF-05 | P2 | `frontend/src/components/ContenidoEnriquecido.jsx:93` | Listas y detalles con RTE | Procesamiento repetido | 0,155 ms por elemento de ~0,9 KB; 100 tarjetas ≈ 15,5 ms por render redundante | DOMPurify + DOMParser + TreeWalker se ejecutaban en cada render, no solo al cambiar el contenido |
| PF-06 | P3 | `backend/app/Controllers/Api/DivulgacionController.php`; `StorageService.php` | Imágenes de empresa, postulante y actividad | Acceso a almacenamiento | 1 consulta + 1 lectura por imagen; `Cache-Control: public, max-age=3600` | Cada imagen es una petición independiente legítima; el navegador ya las cachea y `ProfileImage` usa `loading="lazy"` |
| PF-07 | P3 | Consultas de `OfertaRepository`, `DashboardRepository`, `PostulacionRepository` | Listados y dashboards | Planes de ejecución | 501 filas sintéticas; plan público 0,38 ms, empresa 0,47 ms; `ofertas_habilidades` usa índice de cobertura | Tablas pequeñas; `ALL`/`filesort` no representa un cuello de botella demostrable |
| PF-08 | P3 | `BaseApiController::ok`; `PerfDiagnostics` | Todos los endpoints JSON | Serialización no medida | Se añadió medición; ~0,01–0,2 ms en las muestras | No existía instrumentación por solicitud |

### Evidencia de los planes MariaDB

Sobre 501 ofertas y 1.500 habilidades sintéticas:

```text
publicadas:          ALL ofertas (501) · Using filesort · 0,38 ms
empresa/ofertas:     ALL ofertas (501) · Using filesort · 0,47 ms
habilidades lote:    range oferta_id_habilidad · Using index · 28 filas
postulaciones:       ALL (501) · empresa_id_estado_fecha_postulacion disponible
```

No se creó ningún índice: el coste medido no justifica el coste de escritura y los índices existentes cubren las consultas críticas. Los `filesort` se resolverían con índices orientados al `ORDER BY`, pero el beneficio actual es inferior a 1 ms y el volumen real de SOL es pequeño.

---

## D. Correcciones

### D.1 Habilidades por lote (PF-01)

- Nuevo `OfertaHabilidadModel::deVariasOfertas(array $ids)`: una consulta `WHERE oferta_id IN (...)` y agrupación en memoria.
- `OfertaService::listarMias()` obtiene el mapa una sola vez y lo reutiliza.
- Se conserva el orden de habilidades (`oferta_id`, `habilidad`) y las ofertas sin habilidades devuelven `[]`.
- Regresión: `backend/tests/unit/OfertaHabilidadesLoteTest.php` verifica una sola llamada y el agrupamiento.

### D.2 Detalle de oferta (PF-02)

- `OfertaRepository::detalle()` incorpora el conteo como subconsulta escalar en la consulta principal.
- Las habilidades siguen en una consulta propia (relación 1:N).
- Sin cambios en el contrato de respuesta.

### D.3 Dashboard (PF-03)

- `tiemposPromedio()` calcula ambas medias en una sola consulta con `MIN(CASE WHEN ...)`.
- `AVG` ignora los `NULL`, por lo que el resultado es idéntico al de las dos consultas anteriores.

### D.4 React Query (PF-04)

- `staleTime: 30_000` global en `frontend/src/App.jsx`.
- Las mutaciones siguen invalidando sus claves (`invalidateQueries`) y los datos críticos se refrescan al vencer la ventana.
- No se cachean permisos: `AuthContext` mantiene su flujo de `/auth/me` y preferencias.

### D.5 Contenido enriquecido (PF-05)

- `useMemo` sobre `contenido` en `ContenidoEnriquecido.jsx`.
- DOMPurify, DOMParser y TreeWalker solo se ejecutan cuando cambia el texto; la sanitización sigue activa.

### D.6 Instrumentación (PF-08)

Nuevo `backend/app/Libraries/PerfDiagnostics.php`:

- Activable con `PERF_DIAGNOSTICS=1` o, **solo fuera de producción**, con `X-Perf-Diagnostics: 1`.
- Registra por solicitud: id, método, ruta, estado, total, PHP, SQL, número de consultas, consulta más lenta normalizada, almacenamiento, llamadas externas y serialización.
- Expone `Server-Timing` y `X-Request-ID`; añade ambos a `exposedHeaders` de CORS.
- Escribe JSONL en `writable/logs/perf-AAAA-MM-DD.jsonl` solo cuando está activo.
- Normaliza literales y números; no registra bindings, cuerpos, tokens, JWT, CV ni datos personales.
- Integrada en `BaseApiController`, `ApiExceptionHandler`, respuestas de imagen, `StorageService`, APIsPERU, Turnstile y certificados de Google.

---

## E. Resultados de benchmarks

### E.1 Backend (30 muestras, MariaDB temporal en tmpfs)

| Endpoint (100 ofertas) | Consultas antes | Consultas después | Mediana antes | Mediana después | P95 después |
|---|---:|---:|---:|---:|---:|
| `GET /api/empresa/ofertas` | 104 | **4** | 53,03 ms | **13,37 ms** | 14,23 ms |
| `GET /api/empresa/postulaciones` | 3 | 3 | 10,84 ms | 10,68 ms | 11,15 ms |
| `GET /api/empresa/contrataciones` | 3 | 3 | 11,00 ms | 10,87 ms | 11,23 ms |
| `GET /api/admin/ofertas` | 2 | 2 | 11,74 ms | 11,76 ms | 12,05 ms |
| `GET /api/admin/empresas` | 3 | 3 | 10,91 ms | 10,82 ms | 11,40 ms |
| `GET /api/admin/dashboard` | 10 | **9** | 13,96 ms | 12,43 ms | 14,02 ms |
| `GET /api/admin/empleabilidad` | 5 | 5 | 11,56 ms | 12,13 ms | 12,28 ms |
| `GET /api/postulante/postulaciones` | 3 | 3 | 11,15 ms | 10,75 ms | 11,57 ms |
| `GET /api/postulante/perfil` | 9 | 9 | 14,12 ms | 13,35 ms | 14,02 ms |
| `GET /api/ofertas` | 1 | 1 | 13,97 ms | 11,57 ms | 11,64 ms |
| `GET /api/ofertas/{id}` | 3 | **2** | 10,30 ms | 10,37 ms | 10,62 ms |
| `GET /api/actividades` | 1 | 1 | 9,30 ms | 9,20 ms | 9,62 ms |
| `GET /api/oportunidades` | 1 | 1 | 9,63 ms | 8,68 ms | 9,29 ms |
| `GET /api/categorias` | 1 | 1 | 8,30 ms | 8,53 ms | 8,75 ms |

El crecimiento de consultas del listado de empresa quedó en **0** (14→4 con 10 ofertas; 104→4 con 100). Las diferencias de latencia menores a 1 ms no se consideran concluyentes.

### E.2 Navegación frontend (build de producción, Chromium headless)

Se comparó el mismo backend y datos con dos builds: antes (HEAD) y después.

| Acción cliente | Solicitudes antes | Solicitudes después |
|---|---:|---:|
| Buscar → Mis postulaciones | 2 | **1** |
| Mis postulaciones → Buscar | 4 | **0** |
| Buscar → Mis postulaciones (repetido) | 2 | **0** |
| Admin: Ofertas → Empresas | 1 | 1 |
| Admin: Empresas → Dashboard | 2 | **0** |
| Admin: Dashboard → Ofertas | 1 | **0** |

No cambian las solicitudes de una carga fría completa: el ahorro se produce al remontar pantallas dentro de la sesión. No se observaron bucles de peticiones ni consultas dentro de `map` en el frontend.

### E.3 Saneamiento HTML

- Contenido de ~0,9 KB: 0,155 ms por iteración (DOMPurify + DOMParser + TreeWalker).
- Una lista de 100 tarjetas re-renderizada evita ~15,5 ms de trabajo JavaScript por render. El valor es una medición del trabajo evitado, no una latencia de endpoint.

### E.4 Entorno

| Recurso | Valor |
|---|---|
| Host | Linux 6.18.58.1-microsoft-standard-WSL2 |
| Docker | 6 CPU, ~5,79 GiB RAM |
| PHP | 8.4.27 CLI (imagen de pruebas) |
| MariaDB | 11.4.13-MariaDB-ubu2404 |
| Aislamiento | MariaDB efímero en tmpfs, red Docker temporal, sin volúmenes persistentes |
| Servidor | `php spark serve` (no equivale a FPM productivo) |

Evidencia estructurada:

- `docs/reports/evidence/performance/entorno.json`
- `docs/reports/evidence/performance/benchmark-antes.json`
- `docs/reports/evidence/performance/benchmark-despues.json`
- `docs/reports/evidence/performance/navegacion-antes.json`
- `docs/reports/evidence/performance/navegacion-despues.json`
- `docs/reports/evidence/performance/sanitizacion.json`

Reproducción:

```bash
./deploy/scripts/smoke.sh test_performance.sh
```

La suite crea su propio MariaDB temporal, siembra 10 y 100 ofertas, mide 30 muestras y falla si las consultas crecen con el número de ofertas.

---

## F. Validación funcional por rol y módulo

| Rol / módulo | Estado | Evidencia |
|---|---|---|
| Admin: dashboard, ofertas, actividades, difusión, contrataciones, usuarios, empresas, solicitudes | PASS | E2E 34/35 OK contra stack aislado; smoke suite administrativa |
| Moderador: solicitudes, ofertas, actividades, oportunidades, reportes; sin usuarios/empresas/CSV | PASS | `AutorizacionMunicipalServiceTest` + `test_perfiles_municipales.sh` |
| Solo lectura: consultas permitidas; escrituras y CSV denegados | PASS | `AutorizacionMunicipalServiceTest` + `test_perfiles_municipales.sh` |
| Empresa: perfil, ofertas, postulaciones, contrataciones, reportes | PASS | E2E empresa 6 rutas + formulario; smoke de ofertas/reportes |
| Postulante: buscar, postulaciones, perfil, CV, oportunidades | PASS | E2E postulante 7 rutas; smoke de CV/retiro |
| Público: inicio, login, registro, activación, ofertas, imágenes | PASS | E2E público + smoke de identidad/Turnstile mock |
| Imágenes y documentos | PASS | Smoke de CV/logo; cabeceras privadas de PDF/CV conservadas |

No se modificaron permisos, reglas de negocio, contratos de respuesta ni validaciones. Las operaciones de escritura de E2E se ejecutaron únicamente contra la base temporal.

---

## G. Regresiones ejecutadas

| Suite | Resultado | Detalle |
|---|---|---|
| `php-lint` | **PASS** | Sin errores de sintaxis |
| `backend` (PHPUnit) | **PASS** | 255 tests, 1353 assertions |
| `frontend` | **PASS** | 109/109 tests, lint 0 errores (19 warnings preexistentes), build correcto |
| `audit` | **PASS** | 26 controles, 0 errores, 0 avisos |
| `smoke` | **PASS** | 30 suites, 0 fallos, 0 marcadores |
| `e2e` lectura | **PASS** | 34 OK, 0 fallos, 0 bloqueados (stack aislado) |
| `e2e` escritura | **PASS** | 35 OK, 0 fallos, 0 bloqueados |
| `validation` | **PASS** | 18 correctas, 0 fallidas |
| `compatibility` MySQL→MariaDB | **PASS** | MySQL 8.0.46 → MariaDB 11.4.13, 26 controles, 0 errores, 0 avisos; evidencia en `/tmp/opencode/compat-perf` |

### Incidencia de entorno E2E

El stack de desarrollo tiene `turnstile.enabled=true` en el `.env` privado. Por la restricción de no modificar `.env`, el E2E contra `localhost:5173` quedó **BLOCKED** en el login. Se ejecutó con el mismo código contra un stack aislado (MariaDB temporal, `turnstile.enabled=false`) y pasó 34/34 y 35/35. No es una regresión de la aplicación.

---

## H. Pendientes y limitaciones

1. **Métricas de producción**: LCP, INP, CLS y TTFB reales dependen de FPM, CDN, red y hardware productivo. Aquí se midió en Docker con `spark serve`.
2. **Imágenes**: no se generaron miniaturas ni se cambió el almacenamiento. Las imágenes ya usan `loading="lazy"` y `Cache-Control: public, max-age=3600`; un pipeline de miniaturas requeriría cambios de producto y almacenamiento.
3. **Paginación**: los listados mantienen sus límites actuales (100/200/300). No se cambió el contrato para introducir paginación por cursor.
4. **Índices**: no se añadieron. Los planes actuales muestran scans sobre tablas pequeñas con tiempos sub-milisegundo. Si el volumen crece de forma sostenida, candidatos a revisar son `ofertas(estado, fecha_publicacion)` y `ofertas(empresa_id, updated_at)`.
5. **Contenido enriquecido**: la medición es un microbenchmark del trabajo evitado; no se instrumentó un render completo de 100 tarjetas en el navegador.
6. **Caché HTTP de imágenes**: no se añadió `ETag`/`304`; la política actual de una hora ya evita descargas repetidas y no se demostró un problema.
7. **Base de desarrollo**: no se usó para benchmarks; todo dato sintético se creó en MariaDB temporal y se eliminó al terminar. Los volúmenes persistentes no se tocaron.
8. **E2E contra el stack de desarrollo**: queda BLOCKED por Turnstile activo en el `.env` privado; la misma suite pasó en el stack aislado.

---

## I. Dictamen

**APROBADO CON OBSERVACIONES.**

Las correcciones eliminan el N+1 demostrado, reducen consultas redundantes y disminuyen la latencia del listado de ofertas de la empresa en ~75 % con 100 registros, manteniendo exactamente permisos, reglas, contratos y funcionalidades. La instrumentación permite repetir la medición y detectar regresiones.

Las observaciones son de cobertura, no de corrección: las métricas de Core Web Vitals productivas no están disponibles y no se abordaron mejoras de imágenes/paginación que exigirían cambios de producto o de contrato.
