# Pruebas

Docker es la vía oficial. Los comandos se ejecutan desde la raíz del repositorio
y no requieren PHP, Node.js, Composer, npm, Python ni MySQL en el host.

## Pruebas oficiales

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit en el contenedor backend
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP no destructivo
./deploy/scripts/test.sh validation # validación preventiva, health interno y ACME
./deploy/scripts/test.sh smoke      # integración profunda en MySQL temporal
```

`test.sh validation` ejecuta:

- `tests/deploy/test_validation.sh`: Turnstile, Google OAuth, dominios, URLs,
  CORS, VITE, secretos y configuración de subdominios, sin leer el `.env` real.
- `tests/deploy/test_internal_health.sh`: health de Nginx sin resolución DNS.
- `tests/infra/test_traefik_acme.sh`: inicialización real del resolver
  `letsencrypt` y uso por un router temporal, sin contactar Let's Encrypt ni
  publicar puertos.

La CI de `.github/workflows/ci.yml` usa un `.env` sintético y no requiere
secretos reales, DNS de producción, Cloudflare ni certificados.

> `test.sh smoke` conserva pruebas históricas con aserciones desactualizadas
> respecto de la API actual. En la ejecución de esta tarea quedan
> `WARN` en `test_api.sh`, `test_fase3.sh`, `test_fase4.sh`, `test_rte.sh` y
> `test_reporte_empresa.sh`, y `FAIL` en `test_identidad.sh` (por ejemplo,
> expectativas de correo duplicado/perfil que ya no coinciden con la API). Se
> ejecuta como evidencia no bloqueante y no se usa para validar una
> instalación. No modifica datos reales: usa un MySQL temporal en `tmpfs`.

`test.sh http` requiere el stack activo (`./deploy/scripts/dev.sh up`) y comprueba
`/health`, `/`, `/api/ofertas`, el `401` de `/api/auth/me`, CORS y el frontend.
No crea ni modifica datos.

## Integración profunda en Docker

`test.sh smoke` ejecuta `deploy/scripts/smoke.sh`, que:

1. Construye el target `test` del backend con `bash`, `python3` y `curl`.
2. Crea una red efímera y un MySQL `8.0.46` con `/var/lib/mysql` en `tmpfs`.
3. Aplica migraciones y carga `SystemSeeder` + `DatosPruebaSeeder`.
4. Ejecuta cada script de `tests/smoke/` con `php spark serve` **dentro del
   contenedor**, contra esa base temporal.
5. Reinicia la base temporal entre pruebas y elimina contenedor/red al terminar.

No usa `sol_dev_mysql_data`, no publica puertos y no toca datos reales. El
script `test_desarrollo_nuevo.sh` se excluye por defecto porque consulta SUNAT
y requiere un RUC real y token externo autorizado.

> Los scripts históricos conservan aserciones propias y pueden estar
> desactualizados respecto de la API actual. El runner devuelve código distinto
> de cero y marca `WARN`/`FAIL` cuando detecta `Traceback`, `FAIL` o `FALTA`;
> una prueba solo se considera superada si no aparecen esos indicadores.

### Backend

`tests/unit/` cubre validaciones sin tocar la base: `ValidadorTest`,
`SystemSeederTest`, `IdentidadTest`, `OfertaVencimientoTest`, `HtmlSanitizerTest`,
`TerminosTest`, `EnlaceActivacionTest` y las pruebas de correo.

```bash
./deploy/scripts/test.sh backend
./deploy/scripts/dev.sh run backend php vendor/bin/phpunit tests/unit/ValidadorTest.php
```

### Frontend

```bash
./deploy/scripts/test.sh frontend
```

Incluye las pruebas estáticas de documentos legales, lint y build. La imagen de
desarrollo instala dependencias con `npm ci`; no usa `node_modules` del host.

El rate limiting, el límite de 4 CV por mes y el saneamiento de errores se
validaron manualmente contra la API; aún no tienen pruebas automatizadas.

La trazabilidad funcional contra la especificación está en
[`docs/matriz-cumplimiento.md`](../docs/matriz-cumplimiento.md).
