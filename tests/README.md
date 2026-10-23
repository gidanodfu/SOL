# Pruebas

Docker es la vía oficial. Los comandos se ejecutan desde la raíz del repositorio
y no requieren PHP, Node.js, Composer ni MySQL en el host.

## Pruebas oficiales

```bash
./deploy/scripts/test.sh all        # backend + frontend + build
./deploy/scripts/test.sh backend    # PHPUnit en el contenedor backend
./deploy/scripts/test.sh frontend   # npm test + lint + build
./deploy/scripts/test.sh http       # smoke HTTP no destructivo
```

`test.sh http` requiere el stack activo (`./deploy/scripts/dev.sh up`) y comprueba
`/health`, `/`, `/api/ofertas`, el `401` de `/api/auth/me`, CORS y el frontend.
No crea ni modifica datos.

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

## Pruebas de integración profundas (legado)

Los scripts `test_api.sh`, `test_ofertas.sh`, `test_fase3.sh`… son legado:
inician `php spark serve` y usan `python3`/`curl` del host. No forman parte del
flujo oficial Docker y **no deben apuntar a desarrollo ni a producción**. Si
necesita ejecutarlos, use una base de datos aislada, siembrela con
`DatosPruebaSeeder` y hágalo fuera de este repositorio. Su migración a
contenedores está pendiente y se documentará cuando esté disponible.

El rate limiting, el límite de 4 CV por mes y el saneamiento de errores se
validaron manualmente contra la API; aún no tienen pruebas automatizadas.

La trazabilidad funcional contra la especificación está en
[`docs/matriz-cumplimiento.md`](../docs/matriz-cumplimiento.md).
