# Pruebas

## Unitarias (backend)

```bash
cd backend
vendor/bin/phpunit            # o: vendor/bin/phpunit tests/unit/ValidadorTest.php
```

`tests/unit/ValidadorTest.php` cubre, entre otras reglas, la validación de teléfono
(acepta 9 u 11 dígitos; rechaza 8, 10, 12 y no numéricos).

> El rate limiting (login/auth/CV), el límite de 4 CV por mes y el saneamiento de errores
> se validaron manualmente contra la API; aún no tienen pruebas automatizadas.

## Smoke de la API (integración)

Cada script levanta un servidor temporal (`php spark serve` en :8080), ejecuta el
flujo y lo apaga. Requieren MySQL migrado y con los seeds base: `SystemSeeder`
(datos iniciales) + `DatosPruebaSeeder` (fixtures de las cuentas que usan los
scripts). `SystemSeeder` requiere `INITIAL_ADMIN_*` en `backend/.env`.

```bash
docker compose up -d mysql
cd backend && php spark migrate && php spark db:seed SystemSeeder && php spark db:seed DatosPruebaSeeder && cd ..
./tests/smoke/test_api.sh              # auth por rol, alta admin de empresas, CV
./tests/smoke/test_ofertas.sh          # ciclo de ofertas: publicación directa y cierre
./tests/smoke/test_fase3.sh            # bolsa/búsqueda, postulaciones y perfil (contacto + CV)
./tests/smoke/test_fase4.sh            # bandeja empresa, estados, CV autorizado
./tests/smoke/test_fase5.sh            # actividades, difusión y permisos por rol
./tests/smoke/test_fase6.sh            # contrataciones y reportes
./tests/smoke/test_desarrollo_nuevo.sh # auto-registro de empresa (RUC real), aprobación
                                        # admin, enlace de activación, publicación directa
                                        # de ofertas, bolsa pública sin sesión
```

> Los scripts agregan datos de prueba; para volver al estado base tras correrlos:
> `cd backend && php spark migrate:refresh && php spark db:seed SystemSeeder && php spark db:seed DatosPruebaSeeder`.
> Las credenciales de prueba (`Admin123!`, `Empresa123!`, `Postu123!`, RUC/DNI de ejemplo)
> viven únicamente en `DatosPruebaSeeder` y en estos scripts; no forman parte de la
> instalación inicial.

Notas:

- `test_desarrollo_nuevo.sh` verifica un RUC real contra SUNAT: requiere `sunat.token` en
  `backend/.env` (si el token no está o el RUC no es resoluble, los pasos 1-2 fallan; el
  resto del flujo se puede probar con el enlace interno del admin).
- Los scripts de CV (subida/descarga) dependen de `storage.driver` del `.env` local: con
  driver `supabase` la subida y la URL firmada funcionan contra el bucket configurado; los
  checks de descarga por `archivo/{clave}` son propios del driver `local`.
- El retiro de las secciones del perfil (formación/experiencia/habilidades/cursos) dejó
  fuera de estos scripts su CRUD; el requisito de postular ahora es **contacto completo +
  CV vigente** (cubierto en `test_fase3.sh`).

La trazabilidad funcional contra la especificación está en
[`docs/matriz-cumplimiento.md`](../docs/matriz-cumplimiento.md).
