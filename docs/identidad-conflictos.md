# Diagnóstico de identidad y duplicados históricos

**Fecha:** 2026-10-21 · **Alcance:** inspección de solo lectura + backfill local. No se
fusionaron, eliminaron ni reasignaron cuentas.

## Modelo observado

- `users.username` es único y contiene el RUC (empresa), el DNI (postulante) o el usuario
  administrativo.
- `empresas.ruc` y `postulantes.dni` ya tenían índices únicos.
- `users.email` y `users.telefono` **no** eran únicos.
- `empresas.email` y `empresas.telefono` son datos de contacto; se sincronizan con la
  cuenta al crear/editar para que no diverjan.
- `solicitudes_empresa` guarda RUC, correo y teléfono de la futura cuenta. El vínculo con
  la cuenta se hace por RUC; no tiene `user_id`.

## Duplicados encontrados (entorno local revisado)

| Dato | Grupos duplicados | Cuentas implicadas |
|---|---:|---:|
| Correo en `users` | 3 | 11 |
| Teléfono en `users` | 4 | 15 |
| RUC en `empresas` | 0 | 0 |
| DNI en `postulantes` | 0 | 0 |
| Correo en solicitudes activas | 2 | 8 |
| Teléfono en solicitudes activas | 1 | 6 |

También se detectó **1 solicitud aprobada sin empresa/cuenta asociada**. No se corrigió
automáticamente: sus datos quedaron marcados como conflicto para impedir su reutilización
hasta una resolución administrativa.

## Tratamiento aplicado

- Nueva tabla `identidades_reservadas` con índice único `(tipo, valor)` para correo,
  teléfono, RUC y DNI.
- La migración `2026-10-21-120000_CrearIdentidadesReservadas` rellena la tabla:
  - valores únicos → reserva de cuenta;
  - valores duplicados → fila `estado=conflicto` con referencias por id;
  - solicitudes pendientes → reserva de solicitud;
  - aprobadas sin cuenta → conflicto documentado.
- `solicitudes_empresa.ruc_reservado` (columna generada + índice único) impide dos
  solicitudes pendientes/aprobadas para el mismo RUC.
- Las cuentas históricas siguen funcionando. Si conservan su correo/teléfono actual no se
  les exige cambiarlo; si intentan cambiarlo, deben usar un valor libre.
- El login de empresa es solo por RUC y el de postulante solo por DNI; el correo deja de
  ser identificador para esos roles. Las cuentas Google conservan su flujo.

## Consulta de conflictos

```sql
SELECT tipo, valor, estado, referencias
FROM identidades_reservadas
WHERE estado = 'conflicto'
ORDER BY tipo, valor;
```

No ejecutar la migración en producción sin autorización ni sin revisar antes esta consulta.
