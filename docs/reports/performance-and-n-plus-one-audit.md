# Auditoría integral de rendimiento y N+1 — SOL

**Fecha:** 2026-11-11
**Rama de trabajo:** `main` (rama real; cambios locales sin commit)
**Alcance:** frontend React, API CodeIgniter, MariaDB 11.4.13 y almacenamiento de imágenes/CV.
**Dictamen:** **APROBADO CON OBSERVACIONES** (ver sección I).

---

## A. Resumen ejecutivo

Se auditó la ruta completa navegador → React Query → API → servicios/repositorios → MariaDB → serialización → navegador. Se encontró y corrigió **un N+1 SQL crítico** en la bandeja de ofertas de la empresa y **dos consultas redundantes** en detalle y dashboard. Además se eliminaron revalidaciones HTTP innecesarias al remontar pantallas y se evitó el saneamiento HTML repetido en cada render.

Resultado principal, con 30 muestras para el listado de empresa y 5 para el resto de endpoints, en MariaDB temporal:

| Escala | Antes (consultas) | Después (consultas) | Antes (mediana) | Después (mediana) | Mejora |
|---|---:|---:|---:|---:|---:|
| 10 ofertas | 14 | 4 | 15,55 ms | 11,85 ms | −23,8 % |
| 100 ofertas | 104 | 4 | 53,03 ms | 13,37 ms | **−74,8 % de latencia** |

El número de consultas del listado de la empresa pasó de crecer linealmente con las ofertas a ser constante. El detalle de oferta pasó de 3 a 2 consultas y el dashboard municipal de 10 a 9. No se añadieron índices ni dependencias; la única caché nueva es local y solo para imágenes públicas, nunca para CV ni datos privados. La instrumentación `PERF_DIAGNOSTICS` quedó desactivada por defecto.

La verificación en el stack real de desarrollo confirmó que `storage.driver=supabase` y que el detalle de oferta **no** reproduce los 1,072 s observados: responde en 9,3–17,3 ms (SQL 0,85–1,65 ms, 2 consultas). El logo sí reproducía la regresión: 1,14–1,28 s por lectura externa a Supabase (sin llegar a 3,085 s). Se añadió una caché local solo para imágenes públicas, con lo que la primera lectura sigue siendo fría (~1,28 s) y las siguientes bajan a **8,7–10,1 ms**. Los CV y documentos privados quedan excluidos de esa caché por prefijo.

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
| PF-06 | P1 | `backend/app/Services/StorageService.php`; `EmpresaService`, `PostulanteService`, `ActividadService` | Logos, fotos e imágenes de actividad | Lectura externa sin caché | Logo: 1,14–1,28 s; storage 1,13–1,27 s por petición | Cada lectura bajaba el objeto completo desde Supabase; no había caché de servidor |
| PF-07 | P3 | Consultas de `OfertaRepository`, `DashboardRepository`, `PostulacionRepository` | Listados y dashboards | Planes de ejecución | 501 filas sintéticas; plan público 0,38 ms, empresa 0,47 ms; `ofertas_habilidades` usa índice de cobertura | Tablas pequeñas; `ALL`/`filesort` no representa un cuello de botella demostrable |
| PF-08 | P3 | `BaseApiController::ok`; `PerfDiagnostics` | Todos los endpoints JSON | Serialización no medida | Se añadió medición; ~0,01–0,2 ms en las muestras | No existía instrumentación por solicitud |
| PF-09 | P2 | Controladores y filtros con respuestas directas | 404, 401, 403, 429, descargas y exportaciones | Respuestas sin Server-Timing | 404 de logo pasó de 0 a `Server-Timing` en 9–10 ms | Solo `ok()` y el handler de errores aplicaban la instrumentación |

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

- Nuevo `frontend/src/queryConfig.js` con ventanas por tipo de dato:
  - `operativo` (15 s): ofertas, postulaciones, contrataciones, solicitudes, usuarios, empresas, actividades, oportunidades e indicadores pendientes.
  - `dashboard` (30 s): agregados de dashboard y empleabilidad.
  - `perfil` (60 s): perfil de empresa y de postulante; solo cambian por mutación.
  - `catalogo` (30 min): categorías.
- Las mutaciones siguen invalidando sus claves (`invalidateQueries`) y los datos operativos se refrescan al vencer la ventana.
- El cierre de sesión ejecuta `queryClient.clear()` antes de redirigir; la caché es en memoria y no se comparte entre cuentas.
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
- Cubre respuestas directas que no pasan por `ok()`: 404 de imágenes, 401/403/429 de filtros, CV local y exportaciones Excel/CSV. `Server-Timing` se comprobó en 200, 401, 403 y 404.
- `X-Perf-Diagnostics` **no** se añadió a `allowedHeaders`: los benchmarks lo envían desde curl, no desde el navegador. La activación por cabecera sigue limitada a entornos distintos de producción.

### D.7 Caché de imágenes públicas (PF-06)

- `StorageService::obtenerImagen()` cachea en `writable/cache/media` solo claves con prefijo `empresas/logo/`, `postulantes/foto/` o `actividades/`.
- La clave del objeto cambia aleatoriamente al reemplazar la imagen, por lo que una entrada cacheada nunca sirve una versión anterior.
- Los CV y documentos privados no pasan por esta ruta y se rechazan explícitamente por prefijo.
- TTL de 7 días y limpieza oportunista de archivos con más de 30 días.
- Las subidas nuevas precargan la caché (`recordarImagen`), evitando incluso la primera descarga externa.
- Resultado en el stack real: primera lectura fría 1,28 s; lecturas posteriores 8,7–10,1 ms.

---

## E. Resultados de benchmarks

### E.1 Backend (30 muestras para empresa/ofertas; 5 para el resto; MariaDB temporal en tmpfs)

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

El crecimiento de consultas del listado de empresa quedó en **0** (14→4 con 10 ofertas; 104→4 con 100) y por debajo del presupuesto de 6 consultas. Las diferencias de latencia menores a 1 ms no se consideran concluyentes.

### E.2 Navegación frontend (Chromium headless)

Se comparó el recuento de solicitudes de datos con el mismo backend y datos, antes y después. La medición final se hizo sobre el stack de desarrollo con tokens inyectados para evitar Turnstile; los tiempos entre builds no se comparan, solo las solicitudes.

| Acción cliente | Solicitudes antes | Datos después | Imágenes después |
|---|---:|---:|---:|
| Buscar → Mis postulaciones | 2 | **1** | 1 logo |
| Mis postulaciones → Buscar | 4 | **0** | 0 |
| Buscar → Mis postulaciones (repetido) | 2 | **0** | 0 |
| Admin: Ofertas → Empresas | 1 | 1 | 2 logos |
| Admin: Empresas → Dashboard | 2 | **0** | 0 |
| Admin: Dashboard → Ofertas | 1 | **0** | 0 |

Las imágenes de logo son peticiones legítimas de las tarjetas y se sirven desde la caché del navegador/servidor; no son consultas de datos repetidas. No cambian las solicitudes de una carga fría completa: el ahorro se produce al remontar pantallas dentro de la sesión. No se observaron bucles de peticiones ni consultas dentro de `map`. Firefox no se midió; no se afirma nada sobre ese navegador.

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
| Almacenamiento real | `storage.driver=supabase`, endpoint y bucket configurados (sin exponer credenciales) |
| Medición real | stack `sol_dev`, solo lectura de ofertas/empresas; sin datos de producción |
| Aislamiento benchmarks | MariaDB efímero en tmpfs, red Docker temporal, sin volúmenes persistentes |
| Servidor | `php spark serve` (no equivale a FPM productivo) |

### E.5 Latencia en el stack real de desarrollo

Medición con `X-Perf-Diagnostics: 1`, sin modificar el `.env` ni usar datos de producción.

| Endpoint | Muestras | SQL | Storage | PHP | Total | Consultas |
|---|---:|---:|---:|---:|---:|---:|
| `GET /api/ofertas/4` | 5 | 0,85–1,65 ms | 0 ms | 8,4–15,7 ms | **9,3–17,3 ms** | 2 |
| `GET /api/empresas/1/logo` (antes) | 5 | 0,33–0,47 ms | 1.129–1.274 ms | 8,2–9,8 ms | **1.138–1.283 ms** | 1 |
| `GET /api/empresas/1/logo` (después, warm) | 4 | 0,33–0,41 ms | 0,15–0,16 ms | 8,2–9,6 ms | **8,7–10,1 ms** | 1 |
| `GET /api/empresas/0/logo` | 5 | 0,34 ms | 0 ms | 9,7 ms | **~10 ms (404)** | 1 |
| `GET /api/admin/solicitudes-empresa` | 5 | 1,3–2,0 ms | 0 ms | 8,8–9,7 ms | **10,1–11,7 ms** | 3 |

Conclusión: los 1,072 s del detalle **no se reproducen** (2 consultas, ~10 ms). Los 3,085 s del logo tampoco se reproducen literalmente, pero sí la causa: cada lectura externa costaba ~1,2 s. La caché de imágenes reduce el coste a ~0,16 ms de almacenamiento tras la primera lectura. La primera lectura de un objeto nuevo seguirá siendo fría hasta que se descargue o se suba desde SOL.

Evidencia estructurada:

- `docs/reports/evidence/performance/entorno.json`
- `docs/reports/evidence/performance/benchmark-antes.json`
- `docs/reports/evidence/performance/benchmark-despues.json`
- `docs/reports/evidence/performance/navegacion-antes.json`
- `docs/reports/evidence/performance/navegacion-despues.json`
- `docs/reports/evidence/performance/navegacion-queryconfig.json`
- `docs/reports/evidence/performance/sanitizacion.json`
- `docs/reports/evidence/performance/latencia-stack-real.json`

Reproducción:

```bash
./deploy/scripts/smoke.sh test_performance.sh
```

La suite crea su propio MariaDB temporal, siembra 10 y 100 ofertas, mide 30 muestras para `GET /api/empresa/ofertas` y 5 para el resto. Falla si las consultas crecen con el número de ofertas o si el listado excede el presupuesto de **6 consultas** (`--max-consultas`, configurable con `PERF_MAX_CONSULTAS`).

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
| `backend` (PHPUnit) | **PASS** | 256 tests, 1358 assertions |
| `frontend` | **PASS** | 109/109 tests, lint 0 errores (19 warnings preexistentes), build correcto |
| `audit` | **PASS** | 26 controles, 0 errores, 0 avisos |
| `smoke` | **PASS** | 30 suites, 0 fallos, 0 marcadores |
| `e2e` lectura + escritura | **PASS** | 35 OK, 0 fallos, 0 bloqueados (stack aislado, `E2E_WRITES=1`) |
| `validation` | **PASS** | 18 correctas, 0 fallidas |
| `compatibility` MySQL→MariaDB | **PASS** | Ejecutado antes de la caché de imágenes: MySQL 8.0.46 → MariaDB 11.4.13, 26 controles, 0 errores. No se repitió porque no cambió el esquema. |

### Incidencia de entorno E2E

El stack de desarrollo tiene `turnstile.enabled=true` en el `.env` privado. Por la restricción de no modificar `.env`, el E2E contra `localhost:5173` quedó **BLOCKED** en el login. Se ejecutó con el mismo código contra un stack aislado (MariaDB temporal, `turnstile.enabled=false`): **35/35** con escritura. No es una regresión de la aplicación.

---

## H. Pendientes y limitaciones

1. **Métricas de producción**: LCP, INP, CLS y TTFB reales dependen de FPM, CDN, red y hardware productivo. Aquí se midió en Docker con `spark serve`.
2. **Imágenes**: se añadió caché local de imágenes públicas, pero la primera lectura de un objeto nuevo sigue siendo fría (~1,28 s con Supabase). No se generaron miniaturas ni se migró el almacenamiento; eso requeriría cambios de producto. `ProfileImage` mantiene `loading="lazy"` y el proxy `Cache-Control: public, max-age=3600`.
3. **Paginación**: los listados mantienen sus límites actuales (100/200/300). No se cambió el contrato para introducir paginación por cursor.
4. **Índices**: no se añadieron. Los planes actuales muestran scans sobre tablas pequeñas con tiempos sub-milisegundo. Si el volumen crece de forma sostenida, candidatos a revisar son `ofertas(estado, fecha_publicacion)` y `ofertas(empresa_id, updated_at)`.
5. **Contenido enriquecido**: la medición es un microbenchmark del trabajo evitado; no se instrumentó un render completo de 100 tarjetas en el navegador.
6. **Caché HTTP de imágenes**: no se añadió `ETag`/`304`; la caché de servidor y la política de una hora evitan la descarga repetida. Un CDN/proxy inverso resolvería la primera lectura fría, pero no forma parte del repositorio.
7. **Datos y entorno**: los benchmarks N+1 usaron MariaDB temporal; la comprobación de latencia real fue de solo lectura sobre ofertas/empresas del entorno de desarrollo, sin datos de producción. El `.env` no se modificó y los volúmenes persistentes no se tocaron.
8. **E2E contra el stack de desarrollo**: queda BLOCKED por Turnstile activo en el `.env` privado; la misma suite pasó en el stack aislado.
9. **Navegadores**: todas las mediciones de navegación y saneamiento usan Chromium headless. Firefox no se midió en esta ronda.

---

## I. Dictamen

**APROBADO CON OBSERVACIONES.**

Las correcciones eliminan el N+1 demostrado, reducen consultas redundantes y disminuyen la latencia del listado de ofertas de la empresa en ~75 % con 100 registros, manteniendo exactamente permisos, reglas, contratos y funcionalidades. La instrumentación permite repetir la medición y detectar regresiones.

Las observaciones son de cobertura, no de corrección: las métricas de Core Web Vitals productivas no están disponibles y no se abordaron mejoras de imágenes/paginación que exigirían cambios de producto o de contrato.
