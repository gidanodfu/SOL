# Pruebas

Docker es la vía oficial. Los comandos se ejecutan desde la raíz del repositorio
y no requieren PHP, Node.js, Composer, npm, Python ni MySQL en el host.

## Pruebas oficiales

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit en el contenedor backend
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP no destructivo
./deploy/scripts/test.sh validation # validación preventiva, health interno, WebP y ACME
./deploy/scripts/test.sh smoke      # integración profunda en MySQL temporal
```

`test.sh validation` ejecuta:

- `tests/deploy/test_validation.sh`: Turnstile, Google OAuth, dominios, URLs,
  CORS, VITE, secretos y configuración de subdominios, sin leer el `.env` real.
- `tests/deploy/test_internal_health.sh`: health de Nginx sin resolución DNS.
- `tests/deploy/test_webp_nginx.sh`: MIME `image/webp` y entrega íntegra de WebP,
  PNG y JPEG con la configuración Nginx del frontend.
- `tests/infra/test_traefik_acme.sh`: inicialización real del resolver
  `letsencrypt` y uso por un router temporal, sin contactar Let's Encrypt ni
  publicar puertos.

La CI de `.github/workflows/ci.yml` usa un `.env` sintético y no requiere
secretos reales, DNS de producción, Cloudflare ni certificados.

> `test.sh smoke` ejecuta 21 suites y actualmente termina con código 0.
> Cada suite usa un **esquema MySQL propio** dentro del contenedor temporal,
> con `SystemSeeder` + `DatosPruebaSeeder`, por lo que no depende de IDs,
> empresas o usuarios de otra suite. El runner agrega fallos por suite y
> devuelve código distinto de cero si una suite falla, si aparece
> `Traceback`/`KeyError`/`JSONDecodeError`/`BadZipFile`/`AssertionError`, o si
> un estado HTTP no coincide con el valor entre paréntesis.
> No imprime JWT ni refresh tokens; los campos sensibles se redactan.

`test.sh http` requiere el stack activo (`./deploy/scripts/dev.sh up`) y comprueba
`/health`, `/`, `/api/ofertas`, el `401` de `/api/auth/me`, CORS y el frontend.
No crea ni modifica datos.

## Integración profunda en Docker

`test.sh smoke` ejecuta `deploy/scripts/smoke.sh`, que:

1. Construye el target `test` del backend con `bash`, `python3`, `curl` y `poppler-utils`.
2. Crea una red efímera y un MySQL `8.0.46` con `/var/lib/mysql` en `tmpfs`.
3. Crea un esquema distinto por suite y aplica migraciones + `SystemSeeder` +
   `DatosPruebaSeeder` dentro de cada esquema.
4. Ejecuta cada script de `tests/smoke/` con `php spark serve` **dentro del
   contenedor**, contra su propio esquema.
5. Agrega el resultado, elimina el contenedor/red temporal y devuelve un código
   distinto de cero si alguna suite falla.

No usa `sol_dev_mysql_data`, no publica puertos y no toca datos reales. El
script `test_desarrollo_nuevo.sh` se excluye por defecto porque consulta SUNAT
y requiere un RUC real y token externo autorizado.

Los fixtures de CV están en `tests/fixtures/`: `cv.pdf` y `cv.docx` son
documentos válidos; `cv-malformado.pdf` se usa como caso negativo.
`tests/smoke/test_cv.sh` cubre carga, consulta, descarga autorizada y rechazos
de MIME/firma/rol.

`tests/smoke/test_actividades_obligatorias.sh` cubre la creación de actividades:
todos los campos (tipo, nombre, inicio, fin, modalidad, lugar, organizador,
imagen y descripción) son obligatorios, con error asociado a cada campo; valida
fechas, HTML vacío, tipo/modalidad inválidos, tamaño, contenido y resolución de
la imagen, y confirma que los rechazos no crean registros. También cubre la
edición conservando la imagen existente y el reemplazo por el endpoint dedicado.

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

`test_retiro_postulacion.sh` retira una postulación como postulante y comprueba
que la empresa recibe `409` al intentar reactivarla, sin cambios de estado,
actividad ni historial; también verifica que una desactivación propia sí puede
reactivarse y que otra empresa recibe `404`.

`test_concurrencia.sh` levanta dos procesos `spark serve` sobre el mismo MySQL
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

`tests/unit/` cubre validaciones sin tocar la base: `ValidadorTest`,
`ImageWebpTest`,
`SystemSeederTest`, `IdentidadTest`, `OfertaVencimientoTest`,
`OfertaCatalogoTest`, `ActividadVencimientoTest`, `ReporteExcelServiceTest`,
`ReportePdfServiceTest`, `AutorizacionMunicipalServiceTest`,
`HtmlSanitizerTest`, `PostulacionAuthorizationTest`, `TerminosTest`,
`EnlaceActivacionTest` y las pruebas de correo.

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
La ejecución actual reporta **19 advertencias de Oxlint y 0 errores**: 10 de
`only-export-components`, 7 de `set-state-in-effect` y 2 de `refs`. Son
advertencias estáticas/React Compiler, no errores de compilación y no bloquean
el build; no se hizo una refactorización masiva porque requeriría separar
módulos y revisar los flujos de efectos/refs.

El rate limiting de `/verificar-ruc`, el saneamiento de errores y varios
controles de seguridad se cubren en `test_seguridad.sh`; el límite mensual de
CV se validó manualmente y aún no tiene una prueba de agotamiento automatizada.

La trazabilidad funcional contra la especificación está en
[`docs/matriz-cumplimiento.md`](../docs/matriz-cumplimiento.md).
