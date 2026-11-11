# Informe de validación — Migración de SOL a MariaDB 11.4

> Fecha: 2026-11-11 · Rama: `refactor/mariadb-migration` · `VERSION`: `1.5.4`

## A. Resumen ejecutivo

La aplicación opera sobre **MariaDB 11.4.13 LTS** con el driver `MySQLi`, sin cambios en los contratos de la API ni en las reglas de negocio. Se validaron instalación limpia, importación de datos desde MySQL 8.0.46, restricciones críticas, JSON, columnas generadas, smoke funcional y E2E con Chromium.

**Dictamen: APROBADO CON OBSERVACIONES.** No se detectaron fallos bloqueantes de integridad ni regresiones funcionales. La comparación determinista fila a fila quedó cerrada con 0 diferencias sobre 28 tablas, el rollback fue validado sin limitaciones y CI remoto pasó en GitHub Actions. Permanecen abiertas únicamente la integración real con APIsPERU y la configuración productiva.

## B. Cambios realizados

| Archivo | Cambio |
|---|---|
| `deploy/compose.yaml` | `mariadb:11.4.13`, `MARIADB_*`, healthcheck, `mariadb_data`, charset/collation |
| `deploy/scripts/backup.sh` | `mariadb-dump`, `MARIADB_*` |
| `deploy/scripts/restore.sh` | `mariadb`, restauración en base vacía, corrección del tar de archivos |
| `deploy/scripts/bootstrap.sh`, `dev.sh` | cliente MariaDB |
| `deploy/scripts/smoke.sh` | MariaDB temporal + `test_mariadb_compat.sh` |
| `deploy/scripts/test.sh` | objetivos `e2e` y `audit` |
| `deploy/scripts/e2e.sh` | ejecución E2E en imagen propia |
| `deploy/e2e/Dockerfile` | Node 22 + Chromium Headless Shell + Playwright 1.64.0 |
| `tests/smoke/test_mariadb_compat.sh` | compatibilidad, JSON, columnas generadas, índices |
| `tests/e2e/e2e.mjs` | E2E acumulativa, capturas, `resultado.txt`/`resultado.json` |
| `tests/tools/audit_database_integrity.php` | auditoría de integridad |
| `backend/app/Database/Migrations/2026-10-21-120000_CrearIdentidadesReservadas.php` | `RTRIM(ruc)` para MariaDB |
| `.github/workflows/ci.yml` | auditoría y E2E en CI |
| Documentación | README, backend, deploy, base de datos, operaciones, requerimientos, matriz, integraciones, tests, CHANGELOG |

### Defectos corregidos

1. **Expresión generada con `CHAR`**: MariaDB rechaza `CASE ... THEN ruc ELSE NULL END`; se aplicó `RTRIM(ruc)`.
2. **Importación de datos**: el dump de datos incluía `migrations` y chocaba con el esquema nuevo; se excluye esa tabla.
3. **Restauración en base vacía**: el respaldo de seguridad previo fallaba; ahora se omite si no hay tablas.
4. **Restauración de archivos**: el nombre del tar no se expandía dentro del contenedor; se calcula en el host.
5. **E2E sin credenciales**: no se reenviaban `E2E_*_USER/PASS` al contenedor; corregido.
6. **E2E abortaba en el primer fallo**: ahora acumula resultados, diferencia `FAIL`/`BLOCKED` y escribe informes.
7. **Criterio de auditoría de DNI**: los postulantes de Google pueden no tener DNI; el auditor ahora solo marca documentos inválidos cuando el tipo está definido.

## C. Matriz de pruebas

| # | Prueba | Comando | Resultado |
|---|---|---|---|
| 1 | Sintaxis PHP de archivos modificados | `php -l` | PASS |
| 2 | PHPUnit | `./deploy/scripts/test.sh backend` | PASS — 252 tests, 1336 assertions |
| 3 | Frontend | `./deploy/scripts/test.sh frontend` | PASS — 102/102 |
| 4 | Lint | incluido en frontend | PASS — 0 errores, 19 warnings preexistentes |
| 5 | Build Vite | incluido en frontend | PASS |
| 6 | Validación preventiva | `./deploy/scripts/test.sh validation` | PASS — 18/18 |
| 7 | Instalación limpia MariaDB | `dev.sh migrate`, `SystemSeeder` | PASS — 28 tablas, admin, 10 categorías |
| 8 | Seeds de prueba | `DatosPruebaSeeder` | PASS |
| 9 | Compatibilidad MariaDB | `smoke.sh test_mariadb_compat.sh` | PASS — 26 comprobaciones |
| 10 | JSON profundo | `test_mariadb_compat.sh` | PASS |
| 11 | Columnas generadas (alta/actualización/liberación) | `test_mariadb_compat.sh` | PASS |
| 12 | Smoke completo | `./deploy/scripts/test.sh smoke` | PASS — 29 suites, 0 fallos, 0 marcadores |
| 13 | Auditoría de integridad | `./deploy/scripts/test.sh audit` | PASS — 26 controles, 0 errores |
| 14 | Importación MySQL→MariaDB | procedimiento documentado | PASS — 28 tablas, conteos idénticos |
| 15 | Integridad referencial | auditor + comparación | PASS — 33 FK, 0 huérfanos |
| 16 | Índices únicos | auditor + comparación | PASS — 44 índices idénticos |
| 17 | Respaldo/restauración | `backup.sh`, `restore.sh` | PASS — 28 tablas, 5 usuarios, login OK |
| 18 | Smoke HTTP contra datos migrados | `./deploy/scripts/test.sh http` | PASS — 10/10 |
| 19 | E2E con Chromium contra datos migrados | `./deploy/scripts/test.sh e2e` | PASS — 34/34 |
| 19b | E2E con escritura de perfil en base desechable | `E2E_WRITES=1 test.sh e2e` | PASS — 35/35 |
| 20 | CI workflow | GitHub Actions runs `43107972526`, `43109044353`, `43110059908` | PASS — 7/7 jobs en success |
| 20b | Jobs CI (PHP, frontend, MariaDB, compatibilidad, smoke, E2E, gate) | revisión de dependencias | PASS estático |
La tabla `migrations` se compara por `version`, `class`, `namespace` y `group`.
Se excluyen `id`, `time` y `batch` porque dependen del historial de ejecución de
cada motor, no del contenido del esquema. El resto de las 27 tablas se compara
con todas sus columnas.

| 21 | Comparación determinista fila a fila | `compare_database_data.php` | PASS — 28 tablas, 0 faltantes/extra/modificadas |
| 22 | Rollback de migraciones | `spark migrate:rollback` en MariaDB temporal | PASS — 1 tabla (`migrations`), re-migración 28 tablas |
| 23 | APIsPERU | `test_apisperu_mock.sh` + mocks unitarios | PASS con mock; integración real BLOCKED |
| 24 | Compose de producción | — | NOT APPLICABLE (no existe en el repo) |

## C.1 Cierre de observaciones

| Observación | Estado | Evidencia |
|---|---|---|
| Comparación determinista MySQL→MariaDB | **CERRADA** | 28 tablas, 0 faltantes, 0 extra, 0 modificadas; SHA-256 por fila canonicalizada |
| Rollback de migraciones | **CERRADA** | Rollback deja solo `migrations`; re-migración restaura 28 tablas y restricciones |
| Cobertura E2E de escrituras | **CERRADA** | 35 comprobaciones; edición de perfil persiste y se restaura en base desechable; resto de escrituras cubiertas por smoke/API |
| APIsPERU | **CERRADA POR MOCK / INTEGRACIÓN REAL BLOCKED** | `test_apisperu_mock.sh` valida DNI/RUC, token canónico y persistencia; no se usó token real |
| CI remoto | **CERRADA** | Runs `43107972526`/`43109044353`/`43110059908`: 7/7 jobs success |
| Validación productiva | **BLOCKED / NOT APPLICABLE** | El repositorio solo contiene el stack de desarrollo local |

### Tabla 28: `migrations`

La tabla que completaba las 28 es `migrations`, que contiene únicamente
metadatos técnicos del runner (versión, clase, grupo, namespace, batch y
timestamp de ejecución). No contiene información de negocio. La comparación la
incluye por `version`, `class`, `namespace` y `group`; se ignoran `id`, `time` y
`batch` porque dependen del historial de ejecución de cada motor. Con esa
normalización, las 28 tablas quedan con 0 diferencias.

## D. Compatibilidad

| Elemento | MySQL 8.0.46 | MariaDB 11.4.13 | Resultado |
|---|---|---|---|
| Driver | `MySQLi` | `MySQLi` | Compatible |
| Motor | InnoDB | InnoDB | Igual |
| Charset/collation de tablas | `utf8mb4_general_ci` | `utf8mb4_general_ci` | Igual |
| Collation por defecto de la base | `utf8mb4_0900_ai_ci` | `utf8mb4_uca1400_ai_ci` → ajustada a `utf8mb4_general_ci` | Corregida |
| JSON | tipo `JSON` binario | `LONGTEXT` + `CHECK json_valid` | Diferencia esperada; API equivalente |
| Columnas generadas | `STORED`/`VIRTUAL` | `STORED`/`VIRTUAL` | Igual |
| `CHAR` en expresión generada | Permitido | Rechazado | Corregido con `RTRIM` |
| `ON DUPLICATE KEY UPDATE ... VALUES()` | Soportado | Soportado | Igual |
| `GET_LOCK`/`RELEASE_LOCK` | Soportado | Soportado | Igual |
| `FOR UPDATE` | Soportado | Soportado | Igual |
| `REGEXP_REPLACE` | Soportado | Soportado | Igual |
| Fechas y `America/Lima` | Soportado | Soportado | Igual |

## E. Integridad de datos

- **28 tablas** en origen y destino.
- **27 migraciones**; `migrations` no se importa desde el dump.
- **Conteos idénticos** en las 27 tablas de negocio antes de las pruebas E2E.
- **33 claves foráneas** idénticas.
- **44 índices únicos** idénticos.
- **2 columnas generadas**:
  - `solicitudes_empresa.ruc_reservado`: se anula al rechazar y se libera para reutilización.
  - `postulaciones.postulacion_unica`: se anula al desactivar y se regenera al reactivar.
- **0 huérfanos** en las 33 relaciones.
- **JSON**: objetos, arreglos, anidamiento, UTF-8/ñ, booleanos, nulos, cadenas vacías, actualización de referencias y rechazo de JSON inválido.
- **Respaldo/restauración**: 28 tablas y 5 usuarios restaurados; login correcto.
- Después de E2E, solo aumentaron `auditoria` y `user_refresh_tokens` por los inicios de sesión de prueba y la actividad del usuario; ninguna tabla de negocio cambió.

## F. Validación funcional

| Rol | Cobertura |
|---|---|
| Público | `/inicio`, login, registro, afiliación; responsive 1440/768/390/360 |
| Administración | dashboard, usuarios, empresas, solicitudes, ofertas, actividades, difusión, contrataciones; apertura/cierre de formularios; drawer móvil |
| Empresa | dashboard, perfil, ofertas, postulaciones, contrataciones, cuenta; formulario de oferta |
| Postulante | perfil, postulaciones, cuenta, búsqueda, oportunidades |

Flujos cubiertos por smoke: autenticación, registro, ofertas, aprobación/observación/rechazo, postulaciones, selección, retiro, reactivación, CV y concurrencia, actividades, oportunidades, reportes, perfiles municipales, unicidad global, rate limiting y errores saneados.

Reglas críticas verificadas: ofertas vencidas fuera de búsqueda, bloqueo de postulación a la misma empresa tras selección, CV activo único, contratación única por postulación, identidades reservadas y columnas generadas.

## G. Infraestructura

- Compose de desarrollo con MariaDB 11.4.13, healthcheck, volumen `mariadb_data` y volumen histórico `mysql_data` conservado.
- Backup/restauración con cliente MariaDB, manifiesto y SHA-256.
- CI multi-job para cualquier rama: PHP, frontend, MariaDB, compatibilidad MySQL→MariaDB, smoke y E2E, con artifacts y gate final.
- E2E en imagen propia con Chromium Headless Shell; navegador fuera del repositorio.
- No se modificaron datos de producción ni volúmenes históricos.

### CI posterior a esta validación

Las ejecuciones `43107972526`/`43109044353`/`43110059908` validaron el
pipeline multi-job, incluidos `queue: max`, `upload-artifact` v7.0.2 y la
protección de `.env`.

### Producción

No existe `deploy/compose.prod.yaml`, manifiestos de orquestación,
certificados ni scripts de despliegue productivo en el repositorio. La
documentación vigente describe únicamente el entorno local. **Estado:
BLOCKED / NOT APPLICABLE.** Las variables `DB_*` (backend) y `MARIADB_*`
(contenedor) necesarias, junto con TLS, red, respaldos y monitoreo, deberán
definirse en la infraestructura de cada institución.

## H. Limitaciones

1. **`test_desarrollo_nuevo.sh` no ejecutado contra APIsPERU real**: requiere token y RUC autorizados. La lógica del proveedor y la persistencia están cubiertas con `test_apisperu_mock.sh` y transporte simulado en PHPUnit; la integración real sigue `BLOCKED`.
2. **E2E con integraciones externas desactivadas**: para evitar CAPTCHA/Google en headless se desactivaron temporalmente Turnstile y Google; se restauró `.env` al finalizar.
3. **Cobertura E2E de escrituras**: se validó la edición de perfil con persistencia real en una base desechable; las demás escrituras (ofertas, postulaciones, selección, contratación) se cubren en smoke/API, no todas mediante clics en el navegador.
4. **`deploy/compose.prod.yaml` no existe**: el repositorio solo mantiene el stack de desarrollo local. No hay una configuración productiva validada; desplegar requiere definir variables `DB_*`/`MARIADB_*`, red, TLS, respaldos y monitoreo.

## I. Riesgos restantes

- El volumen `sol_dev_mariadb_data` contiene los datos migrados; el volumen `sol_dev_mysql_data` se conserva como respaldo/reversión.
- La copia temporal `sol_dev_mysql_migration_copy` (192.9 MB) sigue disponible para auditoría; puede eliminarse manualmente cuando se autorice.
- Diferencias de collation por defecto entre motores están resueltas a nivel de tablas/columnas (`utf8mb4_general_ci`); la base se ajustó explícitamente.
- La representación física de JSON cambia (texto + CHECK en MariaDB), pero el contrato de la API y la decodificación PHP son equivalentes.

## J. Dictamen final

**APROBADO CON OBSERVACIONES.**

No hay fallos bloqueantes de integridad, compatibilidad ni reglas de negocio en las pruebas ejecutadas. Las observaciones de la sección H impiden declarar una aprobación total sin reservas, especialmente por la integración real con APIsPERU y la ausencia de configuración productiva validada.

### Comandos de reproducción

```bash
./deploy/scripts/test.sh validation
./deploy/scripts/test.sh all
./deploy/scripts/smoke.sh test_mariadb_compat.sh
./deploy/scripts/test.sh smoke
./deploy/scripts/test.sh audit
./deploy/scripts/test.sh http
./deploy/scripts/test.sh e2e
```

Migración de datos y recuperación: ver `docs/migracion-mariadb.md`.

## Evidencias

- [`evidence/mariadb-comparison.md`](evidence/mariadb-comparison.md)
- [`evidence/mariadb-comparison.json`](evidence/mariadb-comparison.json)
- [`evidence/mariadb-audit.json`](evidence/mariadb-audit.json)
- [`evidence/e2e-migrated-resultado.json`](evidence/e2e-migrated-resultado.json)
- [`evidence/e2e-migrated-resultado.txt`](evidence/e2e-migrated-resultado.txt)
- [`evidence/e2e-writes-resultado.json`](evidence/e2e-writes-resultado.json)
- [`evidence/e2e-writes-resultado.txt`](evidence/e2e-writes-resultado.txt)
- [`evidence/rollback.txt`](evidence/rollback.txt)
- [`evidence/rollback-result.txt`](evidence/rollback-result.txt)
- [`mariadb-rollback.md`](mariadb-rollback.md)
