# Pruebas

Docker es la vía oficial. Los comandos se ejecutan desde la raíz del repositorio
y no requieren PHP, Node.js, Composer, npm, Python ni MariaDB en el host.

## Pruebas oficiales

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit en el contenedor backend
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP no destructivo
./deploy/scripts/test.sh validation # validación de variables y contexto Docker
./deploy/scripts/test.sh smoke      # integración profunda en MariaDB temporal
./deploy/scripts/test.sh e2e        # Chromium headless contra el stack activo
./deploy/scripts/test.sh audit      # integridad de la base MariaDB activa
./deploy/scripts/test.sh compatibility # MySQL 8.0.46 -> MariaDB 11.4.13
./deploy/scripts/test.sh php-lint    # sintaxis de todos los archivos PHP
```

### Inventario de suites smoke

| Suite | Cobertura |
|---|---|
| `test_apisperu_mock.sh` | Flujo DNI/RUC con proveedor HTTP mock local, token canónico y persistencia MariaDB. |
| `test_mariadb_compat.sh` | Versión MariaDB 11.4, InnoDB, columnas generadas, índices únicos, JSON y restricciones críticas. |
| `test_api.sh` | Contrato base de la API, autenticación, ofertas, postulaciones y CV. |
| `test_ofertas.sh` | CRUD y consulta pública de ofertas. |
| `test_aprobacion_ofertas.sh` | Aprobación, observación, rechazo y visibilidad municipal. |
| `test_ofertas_campos.sh` | Campos obligatorios, catálogo de ubicaciones y edición de ofertas. |
| `test_reglas_ofertas.sh` | Vencimiento efectivo, selección formal y bloqueos de postulación. |
| `test_retiro_postulacion.sh` | Retiro voluntario y activación solo para seleccionados. |
| `test_concurrencia.sh` | Carreras de postulación, selección, retiro y reactivación. |
| `test_fase3.sh` | Perfil del postulante y CV. |
| `test_fase4.sh` | Bandeja de empresa, transiciones y contratación. |
| `test_fase5.sh` | Actividades, difusión y dashboard municipal. |
| `test_fase6.sh` | Contrataciones y reportes. |
| `test_seguridad.sh` | XSS, enlaces, rate limiting, cabeceras, rutas privadas y errores saneados. |
| `test_rte.sh` | Editor enriquecido, sanitización HTML y autolink. |
| `test_identidad.sh` | Identidad, normalización y reglas de unicidad. |
| `test_reporte_empresa.sh` | Reportes de la empresa. |
| `test_reporte_ofertas.sh` | Reporte de ofertas y estados efectivos. |
| `test_reporte_pdf.sh` | PDF/Excel, autorización, aislamiento y contenido institucional. |
| `test_perfiles_municipales.sh` | Perfiles `admin/moderador/solo_lectura`, permisos y auditoría. |
| `test_unicidad_municipal.sh` | Unicidad global de correo/teléfono y concurrencia de altas. |
| `test_actividades_obligatorias.sh` | Creación/edición de actividades e imágenes. |
| `test_actividades_finalizadas.sh` | Inmutabilidad de actividades finalizadas. |
| `test_oportunidades_campos.sh` | Creación y edición de oportunidades. |
| `test_oportunidades_ciclo.sh` | Publicación inmediata, estados efectivos y cierre por fecha. |
| `test_cv.sh` | CV válido, descarga, rate limiting, quinto CV y CV activo. |
| `test_cv_concurrencia.sh` | Bloqueo simultáneo, seis cargas y contadores. |
| `test_cv_rate_limit.sh` | Ventanas configurables, reinicio y `Retry-After`. |
| `test_validaciones_estrictas.sh` | Tipos, IDs, booleanos, fechas y contacto. |
| `test_desarrollo_nuevo.sh` | Externo: requiere APIsPERU y un RUC real con token autorizado; se solicita por nombre y corre dentro de Docker. |
| `test_docker_http.sh` | Se ejecuta con `test.sh http` contra el stack de desarrollo. |

La tabla incluye las **29 suites automáticas** del runner (`test.sh smoke`) y dos
procedimientos adicionales: `test_desarrollo_nuevo.sh` (externo, se solicita por
nombre) y `test_docker_http.sh` (`test.sh http`).

`test.sh validation` ejecuta:

- `tests/deploy/test_validation.sh`: Turnstile, Google OAuth, URLs locales,
  CORS, VITE, secretos de ejemplo y valores de desarrollo, sin leer el `.env` real.
- `tests/deploy/test_docker_context.sh`: construye un contexto Docker mínimo y
  comprueba que no incluye `.git` ni `.github`, y que conserva `VERSION`,
  backend, frontend y Compose.

La CI de `.github/workflows/ci.yml` usa un `.env` sintético y no requiere
secretos reales ni servicios externos.

> `test.sh smoke` ejecuta 29 suites y actualmente termina con código 0.
> Cada suite usa un **esquema MariaDB propio** dentro del contenedor temporal,
> con `SystemSeeder` + `DatosPruebaSeeder`, por lo que no depende de IDs,
> empresas o usuarios de otra suite. El runner agrega fallos por suite y
> devuelve código distinto de cero si una suite falla, si aparece
> `Traceback`/`KeyError`/`JSONDecodeError`/`BadZipFile`/`AssertionError`, o si
> un estado HTTP no coincide con el valor entre paréntesis.
> No imprime JWT ni refresh tokens; los campos sensibles se redactan.

### E2E con Chromium

`./deploy/scripts/test.sh e2e` levanta Chromium Headless Shell dentro de una
imagen propia construida desde `deploy/e2e/Dockerfile` (Node 22 + Playwright
1.64.0), con el stack activo. El navegador y sus dependencias viven en la
imagen, fuera del repositorio. La
suite `tests/e2e/e2e.mjs` usa `playwright-core` 1.64.0 (fijado en
`tests/e2e/package-lock.json`) y recorre las pantallas públicas, de
administración, empresa y postulante, además de las cuatro resoluciones
obligatorias. Las evidencias se guardan en `/tmp/sol-e2e-artifacts` por defecto
(configurable con `E2E_ARTIFACTS`).

`test.sh http` requiere el stack activo (`./deploy/scripts/dev.sh up`). Se ejecuta
en un contenedor de la red interna y comprueba `/health`, `/`, `/api/ofertas`,
el `401` de `/api/auth/me`, CORS y el frontend. No usa curl del host ni crea o
modifica datos.

## Integración profunda en Docker

`test.sh smoke` ejecuta `deploy/scripts/smoke.sh`, que:

1. Construye el target `test` del backend con `bash`, `python3`, `curl` y `poppler-utils`.
2. Crea una red efímera y un MariaDB `11.4.13` con `/var/lib/mysql` en `tmpfs`.
3. Crea un esquema distinto por suite y aplica migraciones + `SystemSeeder` +
   `DatosPruebaSeeder` dentro de cada esquema.
4. Ejecuta cada script de `tests/smoke/` con `php spark serve` **dentro del
   contenedor**, contra su propio esquema.
5. Agrega el resultado, elimina el contenedor/red temporal y devuelve un código
   distinto de cero si alguna suite falla.

No usa `sol_dev_mariadb_data`, no publica puertos y no toca datos reales. El
script `test_desarrollo_nuevo.sh` se excluye por defecto porque consulta
APIsPERU y requiere un RUC real y un token externo autorizado; para ejecutarlo:

```bash
./deploy/scripts/smoke.sh test_desarrollo_nuevo.sh
```

Los fixtures de CV están en `tests/fixtures/`: `cv.pdf` y `cv.docx` son
documentos válidos; `cv-malformado.pdf` se usa como caso negativo.

Los smoke que generan un `dni_token` deben firmar también `nombres` y
`apellidos`: el registro persiste la identidad incluida en el comprobante e
ignora los nombres enviados por el navegador.
`tests/smoke/test_cv.sh` cubre carga, consulta, descarga autorizada, rechazos
de MIME/firma/rol, más de cuatro cargas exitosas en el mismo mes, el `429` por
rate limiting, la conservación del CV activo y la ausencia de registros
parciales. También comprueba que la cuota histórica quedó en
`cv_cuotas_mensuales_legado` y que existe `rate_limit_contadores`.

`tests/smoke/test_cv_concurrencia.sh` mantiene una carga en curso mediante
`GET_LOCK`, comprueba el rechazo `429` con `Retry-After`, libera el bloqueo y
verifica que la siguiente carga se acepte. Después envía seis cargas
simultáneas: exige respuestas `201`/`429`, una sola versión vigente, historial
sin duplicados y contadores por usuario/IP coherentes con las cargas exitosas.

`tests/smoke/test_cv_rate_limit.sh` arranca el servidor con ventanas cortas
configurables (`cvRateLimit.*`): dos cargas permitidas, tercera con `429` y
`Retry-After`, reinicio de la ventana corta y nueva carga aceptada; además
verifica que la ventana larga siga bloqueando y que no haya registros parciales.

`tests/smoke/test_validaciones_estrictas.sh` cubre las reglas aprobadas de
contacto (ausente conserva, null/vacío/array rechaza), fecha de nacimiento no
futura, booleanos e identificadores estrictos, fechas y motivo de situación
laboral, y verifica que los rechazos no creen registros.

`tests/smoke/test_actividades_obligatorias.sh` cubre la creación de actividades:
todos los campos (tipo, nombre, inicio, fin, modalidad, lugar, organizador,
imagen y descripción) son obligatorios, con error asociado a cada campo; valida
fechas, HTML vacío, tipo/modalidad inválidos, tamaño, contenido y resolución de
la imagen, y confirma que los rechazos no crean registros. También cubre la
edición conservando la imagen existente y el reemplazo por el endpoint dedicado.

`tests/smoke/test_oportunidades_campos.sh` cubre la obligatoriedad de la
creación de oportunidades: fuente, título, enlace, descripción, inicio, fin y
modalidad, con mensajes por campo, rechazo de URL/protocolo inválidos, HTML
vacío, creación válida y conservación del contrato de edición parcial. La
fecha editorial ya no forma parte del contrato.

`tests/smoke/test_oportunidades_ciclo.sh` cubre la publicación independiente
del inicio: una oportunidad activa con fecha de inicio futura aparece
inmediatamente como `programado` y visible; al alcanzar el inicio pasa a
`en_curso` sin desaparecer; en el instante exacto de fin se finaliza y
desaparece; activo = 0 la oculta sin cambiar su ciclo; cancelado nunca se
publica. También comprueba la ausencia de `fecha_publicacion`, `empresa_id`,
`razon_social` y `ruc` en las respuestas, y la inmutabilidad HTTP de
finalizadas. Cada suite usa un esquema MariaDB efímero propio y no toca datos de
desarrollo.

`tests/smoke/test_actividades_finalizadas.sh` comprueba que una actividad
finalizada manualmente o por fecha de fin (America/Lima) sea de solo lectura:
rechaza edición, cambios de estado, finalización/cancelación repetida, carga y
eliminación de imagen, incluso por HTTP directo, sin afectar a las actividades
vigentes ni a la consulta pública.

El límite de texto enriquecido es inclusivo: se cuentan caracteres visibles
después de sanear/decodificar, sin etiquetas HTML; 9.999 y 10.000 se aceptan y
10.001 se rechaza. Está cubierto en `HtmlSanitizerTest` y `test_rte.sh`.

`test_reglas_ofertas.sh` cubre el vencimiento efectivo (búsqueda, detalle,
postulación directa, bandejas y contadores) y la selección formal por empresa:
bloquea nuevas postulaciones a la misma empresa, no a otras, y persiste aunque
la postulación seleccionada se desactive.

`test_ofertas_campos.sh` valida el catálogo compartido de ubicaciones, la
obligatoriedad de todos los campos de creación, los editores enriquecidos
vacíos, salario/vacantes, la fecha de cierre de Lima y la conservación de una
oferta histórica con ubicación o fecha no pertenecientes al catálogo actual.

`test_retiro_postulacion.sh` cubre la activación restringida: una postulación
en `pendiente`, `en_revision` o `no_seleccionado` recibe `409` al intentar
activarla o desactivarla sin alterar `activo`, `updated_at` ni historial; solo
un candidato `seleccionado` puede desactivarse y reactivarse. El retiro
voluntario bloquea ambas operaciones incluso sin efecto, y otra empresa recibe
`404`.

`test_concurrencia.sh` levanta dos procesos `spark serve` sobre el mismo MariaDB
para enviar peticiones realmente paralelas: valida que dos altas simultáneas a
la misma oferta produzcan un único registro activo, que una selección y una
nueva postulación sigan un orden serial consistente y que un retiro concurrente
con una reactivación termine siempre con el retiro persistido.

`test_perfiles_municipales.sh` cubre la migración `perfil_municipal`, su reversión y
backfill, la creación de cuentas ADMIN/MODERADOR/SOLO LECTURA, la matriz de permisos,
los cambios de perfil con tokens vigentes, el bloqueo del último administrador, la
auditoría y el aislamiento de empresas/postulantes.

`test_unicidad_municipal.sh` cubre la unicidad global de correo/teléfono en el alta
municipal entre cuentas municipales, empresas y postulantes, la normalización de
`00`/`0051`/`51` y separadores, los campos obligatorios, los errores por campo, la
actualización de reservas, la concurrencia de altas y actualizaciones, y la ausencia
de filas parciales. Usa dos procesos `spark serve` para las carreras reales.

`test_reporte_pdf.sh` genera PDF reales (Dompdf) con el backend en Docker y
verifica MIME, descarga privada, nombre con periodo, contenido institucional,
logo en todas las páginas, numeración, secciones vacías, validación 422,
autorización por rol y aislamiento entre empresas; también comprueba que Excel
siga disponible. Usa `poppler-utils` solo en la imagen de pruebas.

`test_reporte_ofertas.sh` inserta una oferta por cada estado en un esquema
aislado, incluida una `publicada` con cierre pasado y otra sin cierre, y verifica
que el Excel administrativo contenga las siete categorías, que sus conteos y
total coincidan con el dashboard y que el Excel de empresa traduzca todos los
estados y muestre `Vencida` para el vencimiento efectivo.

### Backend

`tests/unit/` cubre, entre otras, `ValidadorTest`, `IdentidadTest`,
`RegistroValidacionTest`, `OfertaVencimientoTest`, `OfertaCatalogoTest`,
`ActividadVencimientoTest`, `ActividadInmutabilidadTest`,
`ActividadValidacionTest`, `OportunidadVencimientoTest`,
`OportunidadCreacionValidacionTest`, `PostulacionAuthorizationTest`,
`AutorizacionMunicipalServiceTest`, `HtmlSanitizerTest`,
`DocumentoServiceTest`, `CvServiceClaveTest`, `StorageServiceTest`,
`ReporteExcelServiceTest`, `ReportePdfServiceTest`, `TurnstileServiceTest`,
`TurnstileFlowsTest`, `ApisperuClientTest`, `DniServiceTest`, `RucServiceTest`,
`EmailServiceTest`,
`EmailServiceResendTest`, `ImageWebpTest`, `SystemSeederTest`,
`TerminosTest`, `EnlaceActivacionTest`, `ContentDispositionTest`,
`SuperficieRiesgoTest` y las pruebas de correo. Las validaciones que no
dependen de la base se ejecutan con PHPUnit; las reglas de persistencia,
autorización y concurrencia se cubren en smoke.

Al cierre de la versión 1.4.8 la ejecución reporta **233 tests y 1276
assertions**.

```bash
./deploy/scripts/test.sh backend
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit tests/unit/ValidadorTest.php
```

### Frontend

```bash
./deploy/scripts/test.sh frontend
```

Incluye las pruebas estáticas de documentos legales, catálogo de ubicaciones, uso
centralizado del logo municipal (sin URLs externas ni favicons antiguos), botones
fechas de exportación Excel/PDF, selector de perfil municipal, validación y errores
por campo del alta municipal, permisos de UI y rutas protegidas, lint y build. La imagen de
desarrollo instala dependencias con `npm ci`; no usa `node_modules` del host.
La ejecución actual reporta **93/93 tests, 0 fallos** y **19 advertencias de
Oxlint y 0 errores**: 10 de `only-export-components`, 7 de
`set-state-in-effect` y 2 de `refs`. Son advertencias estáticas/React Compiler,
no errores de compilación y no bloquean el build; no se hizo una refactorización
masiva porque requeriría separar módulos y revisar los flujos de efectos/refs.

El rate limiting de `/verificar-ruc`, el saneamiento de errores y varios
controles de seguridad se cubren en `test_seguridad.sh`. El rate limiting de CV,
el reinicio de ventanas, la concurrencia y la retirada de la cuota mensual están
cubiertos por `test_cv.sh`, `test_cv_concurrencia.sh` y `test_cv_rate_limit.sh`.

La trazabilidad funcional contra la especificación está en
[`docs/matriz-cumplimiento.md`](../docs/matriz-cumplimiento.md).
