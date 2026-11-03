# Changelog

Todos los cambios notables del Sistema de Empleo MDJLO se documentan en este
archivo. El formato sigue la convención de *Keep a Changelog* y la versión
oficial es la del archivo raíz `VERSION`.

## [Unreleased]

### Cambiado

- La empresa solo puede activar o desactivar postulaciones en estado
  `seleccionado`. En `pendiente`, `en_revision` o `no_seleccionado` la API
  responde `409` y no modifica `activo`, `updated_at` ni el historial.
- El retiro voluntario (`retirada_postulante = 1`) bloquea cualquier cambio de
  activación de la empresa, incluso cuando el valor solicitado coincide con el
  actual. Ya no se muestra el botón deshabilitado de reactivación: no se ofrece
  ningún control de activación para esos registros.
- La bandeja de la empresa muestra la indicación "La activación estará
  disponible cuando el candidato sea seleccionado" en estados no seleccionados.

### Corregido

- La publicación pública de oportunidades ya no depende de `fecha_inicio`: una
  oportunidad activa, con programación completa y `fecha_fin` vigente aparece
  inmediatamente en el portal aunque su inicio sea futuro.
- La administración muestra simultáneamente `Programado` (estado efectivo) y
  `Visible` (disponibilidad pública) para oportunidades con inicio futuro.
- Al alcanzar `fecha_inicio` la oportunidad sigue publicada y pasa a `en_curso`;
  al alcanzar `fecha_fin` deja de publicarse y se muestra finalizada en
  administración.
- Se actualizaron las pruebas unitarias, frontend y smoke para cubrir inicio
  futuro visible, reinicio por fecha, estados terminales y zona America/Lima.

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

[1.1.0]: #110--2026-11-01
[1.0.1]: #101--2026-10-31
