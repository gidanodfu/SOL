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
| Tablas tras rollback | 2 (`migrations` y `cv_cuotas_mensuales`) |
| Re-migración | PASS — 28 tablas |
| `ruc_reservado` | PASS — `STORED GENERATED` |
| `postulacion_unica` | PASS — `VIRTUAL GENERATED` |
| `uq_solicitud_ruc_activa` | PASS |
| `uq_postulacion_activa` | PASS |

## Limitación

El rollback elimina las tablas creadas por las migraciones, pero deja
`cv_cuotas_mensuales` como tabla histórica. Esto proviene del diseño de
`RateLimitCvYRetirarCuotas::down()`, que restaura el nombre original de la tabla
legado; no es una regresión de MariaDB. El esquema vuelve a quedar correcto al
re-ejecutar `migrate --all`, con las columnas generadas e índices únicos
presentes.

No se ejecutó rollback sobre `sol_dev` ni sobre datos persistentes.

Log completo: [`evidence/rollback.txt`](evidence/rollback.txt).
