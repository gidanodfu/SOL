# Changelog

Todos los cambios notables del Sistema de Empleo MDJLO se documentan en este
archivo. El formato sigue la convención de *Keep a Changelog* y la versión
oficial es la del archivo raíz `VERSION`.

## [Sin publicar]

### Cambiado

- Se añade `test.sh e2e`: Chromium Headless Shell vía Playwright 1.64.0 en una
  imagen propia externa al repositorio, con recorrido de las pantallas públicas,
  admin, empresa y postulante en escritorio y móvil.
- La base operativa pasa de MySQL 8.0 a **MariaDB 11.4.13 LTS** con volumen
  independiente `mariadb_data`; el volumen histórico de MySQL se conserva.
- Los scripts de respaldo y restauración usan `mariadb-dump`/`mariadb` y
  permiten restaurar en una base vacía.
- La columna generada `solicitudes_empresa.ruc_reservado` usa `RTRIM(ruc)` para
  ser compatible con MariaDB sin alterar el valor ni el índice único.
- El smoke runner usa MariaDB y suma `test_mariadb_compat.sh`; la suite completa
  queda en 29 suites, con flujo mock de APIsPERU.
- Corregidos los smoke de API, concurrencia e identidad: sus comprobantes
  `dni_token` ahora incluyen la identidad canónica, por lo que el registro ya
  no los rechaza con `422` y las suites vuelven a validar sus reglas.
- El repositorio queda destinado exclusivamente al desarrollo local: se retiran
  el Compose y los scripts de producción, Traefik, Nginx de borde, certificados,
  dominios públicos y los stages `prod` de los Dockerfiles.
- Se consolida `deploy/compose.yaml` como único stack de desarrollo.
- La documentación, `.env.example` y la CI describen únicamente el entorno local.
- La consulta de DNI/RUC se centraliza en APIsPERU mediante `ApisperuClient`,
  con configuración exclusiva del backend (`apisperu.baseURL`, `apisperu.token`,
  `apisperu.timeout`). Se retiran JSON.pe, Decolecta y sus variables.
- El comprobante `dni_token` incluye la identidad verificada (nombres y
  apellidos) y el registro la persiste en lugar de los datos del navegador.
- La solicitud empresarial reutiliza también APIsPERU para el RUC y mantiene los
  datos comerciales del proveedor como fuente de verdad.
- Se conservan el backend, el frontend, las migraciones, los seeds, los datos y
  las pruebas funcionales sin cambios.

## [1.5.4] — 2026-11-07

### Cambiado

- Rediseño unificado de la barra lateral en Administración (incluye moderador y
  solo lectura) y Empresa: panel blanco independiente con borde sutil, radios y
  sombra, sin divisores horizontales entre categorías.
- El estado activo usa fondo azul muy claro, texto e icono institucionales y
  mayor peso, conservando la paleta de SOL.
- El pie de usuario se presenta como tarjeta suave y el cierre de sesión se
  adapta al fondo claro.
- El comportamiento responsive del drawer móvil, el contraído de escritorio y
  la navegación por teclado se mantienen.
- La versión oficial del proyecto pasa de `1.4.8` a `1.5.4`; la página Acerca de
  sigue leyendo el archivo raíz `VERSION` a través de Vite.

## [1.4.8] — 2026-11-02

### Añadido

- Rate limiting configurable para la carga de CV por usuario e IP, con ventanas
  cortas y largas (5/10 min y 20/hora por usuario; 10/10 min y 40/hora por IP,
  configurables con `cvRateLimit.*`).
- Bloqueo de una carga simultánea por postulante mediante `GET_LOCK`.
- Tabla `rate_limit_contadores` con clave primaria compuesta
  `(clave, ventana_inicio)` y migración `2026-11-02-120000_RateLimitCvYRetirarCuotas`.
- Validación estricta de escrituras: tipos escalares, IDs positivos, booleanos
  estrictos, fechas calendáricas y no futuras, y actualización de contacto que
  distingue campo ausente, `null`, cadena vacía y valor válido.
- Pruebas de rate limiting, reinicio de ventana, concurrencia de CV, migración
  de cuota a legado y conservación del CV activo.
- Pruebas de publicación inmediata de oportunidades programadas y de activación
  de postulaciones solo para candidatos seleccionados.
- Ajustes de la pantalla `/activar-cuenta`: footer compartido con `/login`,
  mismo ancho y alineación que la tarjeta, sin mini logo, y mensaje de
  confirmación con RUC de la empresa.
- Propagación de `cvRateLimit.*` al `backend.env` generado por los scripts de
  despliegue.

### Cambiado

- Se retiró la cuota mensual de cuatro CV. El CV se versiona sin cuota fija y
  la carga se protege con rate limiting configurable y una operación simultánea
  por postulante.
- La versión del proyecto pasa de `1.1.0` a `1.4.8`.
- Una oportunidad activa con inicio futuro aparece inmediatamente en el portal
  como `programado` y `visible`; `fecha_inicio` solo determina el estado
  efectivo.
- La empresa solo puede activar o desactivar postulaciones en estado
  `seleccionado`. En `pendiente`, `en_revision` o `no_seleccionado` la API
  responde `409` y no modifica `activo`, `updated_at` ni el historial.
- El retiro voluntario (`retirada_postulante = 1`) bloquea cualquier cambio de
  activación de la empresa, incluso cuando el valor solicitado coincide con el
  actual.
- La compilación Vite y la pantalla `/about` siguen leyendo la versión del
  archivo raíz `VERSION`; no se duplica en `package.json` ni en constantes React.
- OpenAPI, README, documentación de operaciones y matriz de cumplimiento se
  actualizan a la versión `1.4.8`.
- Se sincronizó la documentación con el estado real: nuevo `docs/base-datos.md`
  con diagrama ER y catálogo de tablas, OpenAPI con 89 rutas y 107 operaciones,
  READMEs de backend/frontend/despliegue/pruebas y estado vigente de la
  auditoría histórica.

### Corregido

- La publicación pública de oportunidades ya no exige que `fecha_inicio` haya
  llegado; al alcanzar `fecha_fin` deja de publicarse y la administración la
  muestra finalizada.
- La administración muestra simultáneamente `Programado` (estado efectivo) y
  `Visible` (disponibilidad pública) para oportunidades con inicio futuro.
- La activación de postulaciones conserva el CV y el historial ante rechazos y
  no permite eludir la regla mediante peticiones directas a la API.
- Los rechazos de activación de postulaciones no modifican `activo`,
  `updated_at` ni `postulacion_historial`.
- El footer de `/activar-cuenta` deja de extenderse a todo el ancho y de mostrar
  el mini logo municipal.
- El mensaje de cuenta activada indica que se inicia sesión con el RUC de la
  empresa, no con el correo corporativo.

### Eliminado

- `CvCuotaModel`, `LIMITE_MENSUAL`, `consumoMensual()`, `contarDelMes()` y el
  campo `limite_mensual` de la API y del frontend.
- La cuota histórica se conserva como `cv_cuotas_mensuales_legado`; no se
  eliminan datos ni versiones de CV.

### Migraciones

- `2026-11-02-100000_CuotasCvYActivoUnico`: crea `cv_cuotas_mensuales` y
  `cv_activos`, con backfill del CV activo.
- `2026-11-02-120000_RateLimitCvYRetirarCuotas`: renombra la cuota a
  `cv_cuotas_mensuales_legado`, crea `rate_limit_contadores` y permite revertir
  el nombre mediante `down()`.

### Pruebas

- Backend: 220 tests, 1247 assertions.
- Frontend: 79/79 tests, lint sin errores y build correcto.
- Smoke: 27 suites, 0 fallos y 0 marcadores de aserción.
- Validación de despliegue correcta; OpenAPI válido con 107 `operationId`.
- Verificación visual con Chromium de `/activar-cuenta` y de los indicadores de
  oportunidades/postulaciones.

## [1.1.0] — 2026-11-01

### Añadido

- Programación de oportunidades externas con `fecha_inicio`, `fecha_fin` y
  `modalidad` (`presencial`, `virtual`, `mixta`).
- Ciclo de vida de oportunidades (`programado`, `en_curso`, `finalizado`,
  `cancelado`) con `estado_efectivo` calculado en `America/Lima` y transiciones
  manuales equivalentes a las de actividades.
- Endpoint `PUT /api/admin/oportunidades/{id}/estado`.
- Filtro administrativo por estado efectivo y badges separados de ciclo de vida
  y disponibilidad pública.
- Editor enriquecido en la descripción de oportunidades, con sanitización
  backend, autolink seguro y renderizado con `ContenidoEnriquecido`.
- Presentación pública de inicio, fin, modalidad y estado de las oportunidades.
- Regla central `es_visible_publicamente`: solo se publican oportunidades
  activas, con programación completa y dentro de `[fecha_inicio, fecha_fin)`.
- Invalidación de las consultas públicas de oportunidades y actividades al
  modificarlas desde administración.
- Pruebas unitarias, frontend y smoke del ciclo de vida, límites temporales,
  inmutabilidad, campos legados y regresión de actividades.
- Documentación de operaciones, requerimientos, matriz de cumplimiento,
  OpenAPI y pruebas.

### Cambiado

- `activo` se mantiene como decisión administrativa y ya no puede declarar
  visible una oportunidad finalizada, cancelada, incompleta o fuera de ventana.
- Una oportunidad antes de `fecha_inicio` queda `programado` y no se publica
  hasta que comience la ventana; el cierre es inclusivo en `fecha_fin`.
- La administración conserva las oportunidades finalizadas y canceladas para
  consulta histórica, con detalle y bloqueo de escritura.
- El modal de una oportunidad finalizada muestra `Finalizado` y `No visible`,
  motivo de finalización y aviso de solo lectura, sin acciones de edición,
  activación o transición.
- La versión del proyecto pasa de `1.0.1` a `1.1.0`.

### Corregido

- Se eliminó la combinación incorrecta **Finalizado + Visible**.
- El portal público deja de mostrar oportunidades finalizadas, canceladas,
  programadas antes de inicio, ocultas o con programación incompleta.
- Se corrigió la coherencia entre listado administrativo, modal, respuesta API
  y portal público mediante una única regla de dominio.
- Las actividades finalizadas por fecha se excluyen del público desde el
  instante exacto de `fecha_fin` y conservan su historial administrativo.

### Eliminado

- `fecha_publicacion` del modelo operativo de oportunidades, formulario, modal,
  portal, API, validaciones y OpenAPI. Sus valores históricos se archivan en
  `oportunidades_fecha_publicacion_legado` antes de retirar la columna.
- `empresa_id` de oportunidades, junto con su clave foránea e índice, tras
  confirmar que no existía un flujo municipal de asignación. La migración
  aborta de forma segura si encuentra valores no nulos.
- La visualización de `Empresa —` y de IDs de empresa en el detalle.

### Seguridad

- Se excluyen los respaldos `.env.save` y `.env.save.*` del repositorio y del
  contexto de Docker, sin afectar a `.env.example`.
- Se mantienen la sanitización backend del HTML, DOMPurify en el render y la
  validación exclusiva de enlaces `http(s)`.

### Pruebas

- Backend: 207 tests, 1176 assertions.
- Frontend: 72/72 tests, lint sin errores y build correcto.
- Smoke: 24 suites, 0 fallos.
- OpenAPI válido con 91 `operationId` únicos.
- QA headless: 89 comprobaciones, 0 fallos, en 1440×900, 768×1024, 390×844 y
  360×800.
- Migraciones verificadas en instalación limpia, actualización, rollback y
  guard de `empresa_id` con datos no nulos.

## [1.0.1] — 2026-10-31

### Añadido

- Primera versión estable del Sistema de Empleo MDJLO.

[1.5.4]: #154--2026-11-07
[1.4.8]: #148--2026-11-02
[1.1.0]: #110--2026-11-01
[1.0.1]: #101--2026-10-31
