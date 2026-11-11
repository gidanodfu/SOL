# Pruebas E2E con Chromium

Suite de humo funcional que recorre la SPA real con Chromium headless.

## Requisitos

- Stack de desarrollo activo (`./deploy/scripts/dev.sh up`).
- Docker con soporte de `--network host` (Linux/WSL2); en CI se ejecuta sobre
  Ubuntu. La imagen `sol_e2e:local` se construye desde `deploy/e2e/Dockerfile`.
- `playwright-core` 1.64.0 (fijado en `package-lock.json`), que usa Chromium
  `156.0.8078.4` (revisión 1248).

El navegador y sus dependencias se ejecutan dentro de la imagen oficial de
Playwright, nunca se descargan al repositorio.

## Ejecución

```bash
./deploy/scripts/test.sh e2e
```

Variables opcionales:

- `E2E_BASE_URL`: URL del frontend (por defecto `http://localhost:<DEV_FRONTEND_PORT>`).
- `E2E_ARTIFACTS`: directorio de evidencias (por defecto `/tmp/sol-e2e-artifacts`).
- `E2E_ADMIN_USER` / `E2E_ADMIN_PASS`
- `E2E_EMPRESA_USER` / `E2E_EMPRESA_PASS`
- `E2E_POSTULANTE_USER` / `E2E_POSTULANTE_PASS`

Los valores por defecto coinciden con `DatosPruebaSeeder` y solo existen en el
entorno local/CI; no son credenciales de producción.

## Cobertura

- Público: `/inicio`, `/login`, `/registro`, `/registro-empresa`.
- Administración: dashboard, usuarios, empresas, solicitudes, ofertas,
  actividades, difusión y contrataciones.
- Empresa: dashboard, perfil, ofertas, postulaciones, contrataciones y cuenta.
- Postulante: perfil, postulaciones, cuenta, búsqueda y oportunidades.
- Interacciones: apertura/cierre del alta de usuario, editores de actividad y
  oportunidad, formulario de oferta y drawer móvil.
- Responsive: 1440×900, 768×1024, 390×844 y 360×800, con comprobación de
  desbordamiento horizontal y errores de consola/API.

Las pruebas también fallan si una página emite un `pageerror`, un error de
consola no esperado o una respuesta API 5xx.
