# Auditoría del flujo de imágenes — SOL

**Fecha:** 2026-11-12
**Rama:** `main`
**Dictamen:** **APROBADO CON OBSERVACIONES**

---

## A. Resumen ejecutivo

Se auditaron los tres flujos de escritura (logos, fotografías y actividades), la lectura pública, la caché local, el versionado de URLs y los componentes de imagen del frontend. Se reprodujeron cinco problemas reales y se corrigieron de forma conservadora:

| ID | Hallazgo | Estado |
|---|---|---|
| IMG-01 | `Cache-Control` se concatenaba con `no-store/no-cache`: el navegador no cacheaba las imágenes | **FAIL → corregido** |
| IMG-02 | Logos, fotos y actividades usaban URL estable: tras reemplazar la imagen el navegador podía conservar la anterior | **FAIL → corregido** |
| IMG-03 | `StorageService::eliminar()` no borraba la entrada de `writable/cache/media` | **FAIL → corregido** |
| IMG-04 | Cache stampede: 10 lectores concurrentes con caché vacía ejecutaban 10 descargas externas | **FAIL → corregido** (10 → 1) |
| IMG-05 | `ActivityImage` no reiniciaba el estado de error al cambiar `src` | **FAIL → corregido** |
| IMG-06 | URLs con id 0 (`/api/empresas/0/logo`) | **PASS**: no existe productor; el endpoint responde 404 correcto |
| IMG-07 | Miniaturas/variantes para avatares pequeños | **NO CAMBIADO**: los bytes lo justifican, pero falta benchmark visual y contrato de variantes |
| IMG-08 | Actividades conservan el archivo original | **PASS**: los originales reales observados pesan 4–22 KB |
| IMG-09 | CV/documentos privados en caché pública | **PASS**: la caché solo acepta tres prefijos de imagen pública |

No se sustituyó Supabase, no se cambió el bucket ni las credenciales, no se modificó el `.env`, no se tocaron datos persistentes y no se añadieron dependencias.

---

## B. Diagrama real del flujo

### Escritura de logo

```text
POST /api/empresa/perfil/logo
  EmpresaService::subirLogo()
    → exigirPropia()
    → guardarLogo()
        ImageService::leerSubida()          # tamaño y lectura
        ImageService::normalizar(contain,png) # 800x800, PNG
        StorageService::almacenarContenido()  # Supabase PUT
        StorageService::recordarImagen()      # precarga caché local
        UPDATE empresas.logo_key
        StorageService::eliminar(anterior)    # objeto + caché anterior
```

### Lectura pública

```text
GET /api/empresas/{id}/logo
  DivulgacionController::imagenEmpresa()
    → EmpresaService::logoContenido()
        → claveImagen()
        → StorageService::obtenerImagen()
            cache vigente? → archivo local
            miss → bloqueo por objectKey → recheck
                 → Supabase GET → archivo temporal → rename atómico
    → 200 image/png + Cache-Control: public, max-age=3600
```

### Fotografías y actividades

- Fotografía: `PostulanteService::subirFoto()` usa `cover` + JPEG; reemplazo y eliminación siguen el mismo patrón que el logo.
- Actividad: `ActividadService::validarImagen()` valida MIME real, bytes mágicos, decodificación GD, 2 MB y 1920×1080; conserva el original. `subirImagen()` y `eliminarImagen()` sustituyen/eliminan el objeto anterior.

---

## C. Archivos implicados

- `backend/app/Services/StorageService.php`
- `backend/app/Services/EmpresaService.php`
- `backend/app/Services/PostulanteService.php`
- `backend/app/Services/ActividadService.php`
- `backend/app/Services/ImageService.php`
- `backend/app/Controllers/Api/DivulgacionController.php`
- `backend/app/Repositories/PostulanteRepository.php`
- `frontend/src/components/ActivityImage.jsx`
- `frontend/src/components/ProfileImage.jsx`
- `frontend/src/components/ImagenUploader.jsx`
- `frontend/src/components/EmpresaDetalleContenido.jsx`
- `tests/tools/image_cache_stampede.php`
- `tests/tools/image_pipeline_benchmark.php`
- `tests/tools/image_cache_probe.php`

---

## D. Hallazgos demostrados

### IMG-01 — Cache-Control ineficaz (FAIL → corregido)

Antes, la respuesta real del proxy contenía:

```text
Cache-Control: no-store, max-age=0, no-cache, public, max-age=3600
```

`no-store` anula la política pública: el navegador podía repetir cada logo/foto aunque la URL no cambiara. Se cambió a `removeHeader('Cache-Control')` antes de fijar la política. Ahora:

```text
Cache-Control: public, max-age=3600
```

Se comprobó en el stack real y en el stack aislado con Playwright. Las respuestas 404 siguen sin caché pública.

### IMG-02 — URLs estables (FAIL → corregido)

Solo `PostulanteRepository::perfilCompleto()` versionaba la foto. Los demás generadores usaban URLs estables:

- `EmpresaService::conImagenPublica()`
- `OfertaService::conEmpresa()`
- `PostulacionService::listar()`
- `PostulacionService::listarDeEmpresa()`
- `ActividadService::conImagenPublica()`

Se añadió `StorageService::urlVersionada()`: agrega `?v=<sha1(clave) primeros 10>` o `&v=...` si ya hay query. La clave interna nunca sale del backend. Se aplicó a logos, fotos y actividades.

Prueba real en stack aislado, con navegador y caché habilitada:

| Comprobación | Resultado |
|---|---|
| Subida A → `logo_url` | `/api/empresas/1/logo?v=9cd9acfa26` |
| Subida B → `logo_url` | `/api/empresas/1/logo?v=fb6461945c` |
| Hash de bytes A / B | distinto |
| `img.src` antes / después | URL A / URL B |
| Dimensiones naturales | 800×800 / 800×800 |
| `Cache-Control` | `public, max-age=3600` |
| Navegador usa URL nueva | **sí** |

La URL antigua sigue respondiendo 200 porque el proxy devuelve la imagen actual de la empresa e ignora `v`; no es un fallback silencioso, es la semántica del endpoint. El navegador deja de pedirla porque la respuesta de datos ya trae la URL nueva.

Evidencia: `docs/reports/evidence/images/reemplazo-logo-navegador.json`.

### IMG-03 — Caché obsoleta al eliminar (FAIL → corregido)

`StorageService::eliminar()` borraba el objeto local/remoto pero no la entrada `writable/cache/media/<sha256(objectKey)>.bin`. El archivo anterior quedaba en disco hasta la limpieza oportunista de 30 días.

Ahora `eliminar()` llama a `borrarCacheImagen()` tanto en driver local como Supabase. Solo actúa sobre prefijos de imagen pública; un CV no tiene entrada de caché que borrar.

Prueba: `StorageServiceTest::testEliminarBorraLaEntradaDeCacheAunqueElDriverSeaLocal()` y `testObtenerImagenReutilizaLaCacheYBorraLaEntrada()`. En el flujo local de reemplazo se comprobó que el archivo anterior desaparece del directorio.

### IMG-04 — Cache stampede (FAIL → corregido)

Prueba con caché vacía, 10 procesos hijos y un mock de `StorageService` que cuenta descargas externas:

| Código | Descargas externas |
|---|---:|
| Antes (sin bloqueo) | **10** |
| Después (bloqueo por objectKey + recheck) | **1** |

Implementación:

- `flock(LOCK_EX)` sobre un archivo de bloqueo por `objectKey`.
- Segunda comprobación de caché tras adquirir el bloqueo.
- Escritura en archivo temporal y `rename()` atómico.
- Liberación en `finally`, también ante excepciones.
- Archivos de bloqueo pequeños, con limpieza de los antiguos junto con la caché.

No hay bloqueo global: cada imagen tiene su propio bloqueo.

Evidencia: `stampede-antes.json` y `stampede-despues.json`.

### IMG-05 — ActivityImage no reiniciaba error (FAIL → corregido)

`ProfileImage` reiniciaba el fallo con `useEffect([src])`; `ActivityImage` no. Si una imagen fallaba y el padre reemplazaba `src`, el placeholder seguía visible.

Se sustituyó el booleano por `errorSrc`: el error se vincula a la `src` que falló (`errorSrc !== src`). Al cambiar la URL, la nueva imagen se muestra sin efecto ni render adicional. Prueba: `frontend/tests/image-pipeline.test.mjs`.

### IMG-06 — IDs inválidos (PASS)

`/api/empresas/0/logo`, `/api/postulantes/0/foto` y `/api/actividades/0/imagen` responden **404 JSON** en ~10 ms. No existe en el código un generador de `/api/empresas/0/logo`; las consultas a ofertas/postulaciones/empresas con id 0 o relaciones huérfanas devolvieron 0 filas. No se añadió un fallback que oculte datos inválidos.

Evidencia: `ids-invalidos.json`.

### IMG-07 — Miniaturas y variantes (NO CAMBIADO)

Tamaños reales observados en el entorno de desarrollo:

| Recurso | Bytes |
|---|---:|
| Logo empresa 1 | 195.499 |
| Logo empresa 10 | 454.042 |
| Foto postulante 2 | 68.775 |
| Foto postulante 3 | 134.142 |
| Foto postulante 4 | 49.279 |
| Actividades 1–3 | 4.480–22.671 |

Los avatares de listado se muestran a 34–72 px, pero el proxy entrega la imagen normalizada completa de 800×800. Una miniatura de 128 px medida sobre las imágenes sintéticas ocupa 1,8–2,2 KB frente a 4,9–19 KB de la normalizada. Los bytes justifican evaluar variantes, pero **no se implementaron**: requieren benchmark visual, una ruta/almacenamiento de variantes y un contrato nuevo. No se añadió `srcset` sin variantes válidas.

Evidencia: `pipeline-sintetico.json`, `tamanos-reales.json`.

### IMG-08 — Actividades conservan el original (PASS)

Los originales reales observados pesan 4–22 KB y están dentro del límite de 2 MB y 1920×1080. Conservar el original es apropiado para sus tamaños de presentación actuales. No se cambió calidad, resolución ni formato.

### IMG-09 — Privacidad de CV (PASS)

`obtenerImagen()` solo acepta:

- `empresas/logo/`
- `postulantes/foto/`
- `actividades/`

Un CV (`postulante-1/...`) devuelve `null` y no se escribe en la caché. La prueba `testCacheLocalSoloAceptaImagenesPublicas()` cubre la exclusión. `obtenerContenido()` sigue existiendo para los flujos privados, pero no cachea.

### IMG-10 — MIME y cabeceras (PASS con observación)

Las imágenes responden con MIME correcto y `Content-Disposition: inline`. CI4 añade `; charset=UTF-8` al `Content-Type` de imágenes (`image/png; charset=UTF-8`). Es válido como parámetro, aunque innecesario; no se cambió para no alterar el comportamiento ni las expectativas existentes.

---

## E. Benchmarks

### Lectura (stack real, `storage.driver=supabase`, 5 muestras)

| Recurso | P50 | P95 | Bytes |
|---|---:|---:|---:|
| Logo empresa 1 (warm) | 11,12 ms | 12,81 ms | 195.499 |
| Logo empresa 10 (warm) | 11,79 ms | 12,77 ms | 454.042 |
| Actividad 1 | 10,51 ms | 11,04 ms | 9.088 |
| Actividad 2 | 10,51 ms | 10,71 ms | 22.671 |
| Foto postulante 2 | 10,50 ms | 11,25 ms | 68.775 |

Cold de logo medido antes de la caché: **1.138–1.283 ms**, con **1.129–1.274 ms** de almacenamiento. Warm: **8,7–12,5 ms**, con **0,15–0,21 ms** de almacenamiento. La primera lectura de una objectKey nueva sigue siendo fría hasta que se descarga o se sube desde SOL.

### Escritura local (stack aislado, imágenes sintéticas)

| Operación | Tiempo |
|---|---:|
| Subida de logo | 75–80 ms |
| Subida de foto | 77 ms |
| Crear actividad | 16 ms |
| Reemplazar imagen de actividad | 14 ms |
| Eliminar imagen de actividad | 14 ms |

Son tiempos de driver local con imágenes pequeñas; no representan la latencia de subida a Supabase.

### Variantes sintéticas

| Caso | Origen | Normalizado | Miniatura 128 px |
|---|---:|---:|---:|
| Logo contain PNG | 6.080 B (1600×800) | 4.948 B (800×800) | 1.852 B |
| Foto cover JPEG | 48.433 B (1200×1600) | 19.036 B (800×800) | 2.161 B |
| Actividad JPEG | 52.357 B (1920×1080) | conserva original | — |
| Actividad WebP experimental | — | 3.956 B (1280×720) | — |

Los patrones sintéticos comprimen mejor que una foto real; los valores son orientativos. No se usaron para afirmar calidad visual ni para reemplazar formatos.

---

## F. Pruebas

| Suite | Resultado |
|---|---|
| PHPUnit | **PASS** — 262 tests, 1.386 assertions |
| Frontend | **PASS** — 111/111 |
| Lint | **PASS** — 0 errores, 19 warnings preexistentes |
| Build | **PASS** |
| Smoke | **PASS** — 30 suites, 0 fallos |
| E2E con escritura | **PASS** — 35/35 en stack aislado |
| Auditoría de integridad | **PASS** — 26 controles, 0 errores |
| Validación de configuración | **PASS** — 18/18 |
| Compatibilidad MySQL/MariaDB | **NOT RUN** — sin cambios de esquema ni de SQL de datos |

Pruebas nuevas:

- `ImageServiceTest`: contain PNG 800×800, cover JPEG 800×800, rechazo de contenido no imagen.
- `StorageServiceTest`: versionado opaco, cache hit, borrado de caché, exclusión de CV.
- `image-pipeline.test.mjs`: reset de `ActivityImage`, `loading="lazy"` y reset de `ProfileImage`.
- `image_cache_stampede.php`: 10 procesos, una sola descarga externa.
- `test_performance.sh`: ejecuta el benchmark y la prueba de stampede dentro del smoke.

---

## G. Hipótesis descartadas

| Hipótesis | Resultado |
|---|---|
| El detalle de oferta era lento por las imágenes | Descartada: `/api/ofertas/4` responde en 9–17 ms y no carga imágenes. |
| El logo tarda 3,085 s siempre | No reproducido literalmente: cold 1,14–1,28 s; la causa sí era la descarga externa. |
| Hay un productor de `/api/empresas/0/logo` | No encontrado en código ni datos; el 404 es correcto. |
| Las fotos de postulante tienen el mismo problema de URL | Ya estaba versionada; se unificó con el helper. |
| Hay que convertir todos los logos a WebP | No se cambió: falta benchmark visual y el contrato actual espera PNG. |
| El bucket debe hacerse público | Descartado: se conserva privado y el proxy sigue siendo la única salida. |

---

## H. Riesgos y limitaciones

1. **Primera lectura fría** de una imagen nueva sigue costando ~1,2 s con Supabase. Un CDN/proxy inverso lo resolvería, pero no forma parte del repositorio.
2. **Caché en disco**: crece con las imágenes vistas. TTL 7 días y limpieza oportunista de 30 días; los bloqueos se limpian con la misma política.
3. **Supabase writes**: la prueba de reemplazo/borrado con Supabase real no se ejecutó para no modificar el bucket; se validó con mock/unit tests y con driver local en el flujo HTTP.
4. **Miniaturas**: no implementadas; los bytes las justifican, pero requieren decisión de producto y benchmark visual.
5. **Navegadores**: la prueba de reemplazo se hizo en Chromium headless. No se midió Firefox.
6. **Producción**: las cifras de lectura real son del entorno de desarrollo (`sol_dev`), no de un FPM/CDN productivo.
7. **`Content-Type`**: conserva `charset=UTF-8` añadido por CI4; no se alteró.

---

## I. Evidencia estructurada

- `docs/reports/evidence/images/pipeline-sintetico.json`
- `docs/reports/evidence/images/tamanos-reales.json`
- `docs/reports/evidence/images/reemplazo-logo-navegador.json`
- `docs/reports/evidence/images/stampede-antes.json`
- `docs/reports/evidence/images/stampede-despues.json`
- `docs/reports/evidence/images/lecturas-cacheadas.json`
- `docs/reports/evidence/images/ids-invalidos.json`
- `docs/reports/evidence/images/cabeceras-imagen.json`

## J. Dictamen

**APROBADO CON OBSERVACIONES.**

Se corrigieron los defectos reproducibles de caché, versionado, borrado y concurrencia, y se conservó la arquitectura, la privacidad y el contrato de datos. Las observaciones restantes son de producto/entorno: primera lectura fría, miniaturas y métricas productivas.
