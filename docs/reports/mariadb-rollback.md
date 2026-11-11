# Prueba de rollback de migraciones — MariaDB

Fecha: 2026-11-11 · Entorno: MariaDB 11.4.13 temporal (`--tmpfs`), base `sol_rollback`.

## Procedimiento ejecutado

1. Base vacía.
2. `php spark migrate --all` → **28 tablas**.
3. `SystemSeeder` + `DatosPruebaSeeder` → 5 usuarios y datos sintéticos.
4. `php spark migrate:rollback` → código de salida **0**.
5. Verificación del esquema resultante.
6. `php spark migrate --all` de nuevo.
7. Verificación de tablas, columnas generadas e índices.

## Resultado

| Paso | Resultado |
|---|---|
| Migraciones iniciales | PASS — 28 tablas |
| Seeds | PASS — 5 usuarios |
| Rollback | PASS — comando sin errores |
| Tablas tras rollback | 1 (`migrations`) |
| Re-migración | PASS — 28 tablas |
| `ruc_reservado` | PASS — `STORED GENERATED` |
| `postulacion_unica` | PASS — `VIRTUAL GENERATED` |
| `uq_solicitud_ruc_activa` | PASS |
| `uq_postulacion_activa` | PASS |

## Corrección aplicada

`RateLimitCvYRetirarCuotas::down()` usaba `tableExists()`, cuyo caché podía
conservar el estado anterior al `RENAME` de `up()` y dejar
`cv_cuotas_mensuales` tras el rollback. Ahora consulta `information_schema`
directamente y, si `cv_activos` ya no existe, elimina ambas tablas históricas.
`CuotasCvYActivoUnico::down()` usa `DROP TABLE IF EXISTS` directo para las tres
tablas que le pertenecen.

El rollback deja únicamente `migrations`; la re-migración restaura 28 tablas y
las restricciones críticas. Sin limitación pendiente.

No se ejecutó rollback sobre `sol_dev` ni sobre datos persistentes.

Log de comandos: [`evidence/rollback.txt`](evidence/rollback.txt).

Resumen de ejecución (tablas tras rollback y re-migración):
[`evidence/rollback-result.txt`](evidence/rollback-result.txt).
