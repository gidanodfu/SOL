# Integración continua (GitHub Actions)

> Workflow: `.github/workflows/ci.yml` · Repositorio: `gidanodfu/SOL`

## 1. Eventos y ramas

El workflow se ejecuta en:

- `push` a **cualquier rama**.
- `pull_request` hacia **cualquier rama**.
- `workflow_dispatch` para ejecución manual.

No hay filtros `paths`, `paths-ignore` ni listas de ramas que excluyan
documentación, infraestructura, migraciones o pruebas. Las ramas anidadas
(`feature/...`, `fix/...`, `refactor/...`, `release/...`) quedan cubiertas.

El workflow debe existir en la rama que recibe el push para que GitHub lo
ejecute; en ramas creadas antes de su incorporación, haga un push que incluya
este archivo o ejecútelo manualmente.

## 2. Permisos

```yaml
permissions:
  contents: read
```

No se usan secretos de producción. El workflow no usa `pull_request_target`.
Las credenciales son sintéticas y las genera
`.github/scripts/prepare-ci-env.sh` a partir de `.env.example`.

## 3. Concurrencia

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
```

Cada referencia tiene su cola. Un push nuevo **no cancela** la ejecución
pendiente; espera su turno. Esto conserva la evidencia de ejecuciones previas.

## 4. Jobs

| Job | Nombre del check | Cobertura |
|---|---|---|
| `php` | PHP (sintaxis, PHPUnit y configuración) | `php -l` de `backend/app`, `backend/tests` y `tests/tools`; `test.sh validation`; PHPUnit |
| `frontend` | Frontend (tests, lint y build) | `npm test`, `npm run lint`, `npm run build` |
| `mariadb` | MariaDB (migraciones, seeds y auditoría) | MariaDB 11.4.13, migraciones, `DatosPruebaSeeder`, auditoría, smoke HTTP, compatibilidad |
| `compatibility` | Compatibilidad MySQL 8.0 -> MariaDB 11.4 | MySQL 8.0.46 y MariaDB 11.4.13 temporales, dump/import, comparación SHA-256 de 28 tablas, auditoría |
| `smoke` | Smoke (29 suites) | `test.sh smoke` contra MariaDB temporal |
| `e2e` | E2E (Chromium Headless) | stack con MariaDB temporal, 34 comprobaciones de lectura y edición de perfil con `E2E_WRITES=1` |
| `gate` | CI Validación global | Consolida y falla si un job obligatorio no terminó en `success` |

`gate` depende de `php`, `frontend`, `mariadb`, `compatibility`, `smoke` y
`e2e`, y se ejecuta con `if: always()`. Un job `failure`, `cancelled`, `skipped`
o ausente hace fallar la validación global; `BLOCKED`/`NOT RUN` nunca se
convierten en `PASS`.

## 5. Servicios temporales

- **MariaDB 11.4.13**: usado por el stack de desarrollo (`mariadb:11.4.13`) y
  por el runner smoke (`--tmpfs`, esquema por suite).
- **MySQL 8.0.46**: solo en `compatibility`, en un contenedor temporal con
  `--tmpfs`.
- Ningún job usa los volúmenes `sol_dev_mysql_data` ni
  `sol_dev_mariadb_data` del desarrollador.

## 6. Variables de CI

`.github/scripts/prepare-ci-env.sh` crea un `.env` efímero con:

- `CI_ENVIRONMENT=development`, `COMPOSE_PROJECT_NAME=sol_ci`.
- `DB_*` sintéticas, `jwt.secret` y `encryption.key` de CI.
- `turnstile.enabled=false`, Site Key/Secret Key vacías.
- `google.clientId` y `VITE_GOOGLE_CLIENT_ID` vacíos.
- `INITIAL_ADMIN_*` de CI.
- URLs locales (`APP_URL`, `app.baseURL`, `VITE_API_URL`, CORS).

No se imprime ningún secreto. `.env` está en `.gitignore` y excluido de Docker.

## 7. Artifacts

Cada job publica con `if: always()` y retención de 7 días:

| Artifact | Contenido |
|---|---|
| `php-logs` | `php-lint.log`, `validation.log`, `phpunit.log` |
| `frontend-logs` | tests, lint y build |
| `mariadb-logs` | up, migrate, seed, audit, HTTP y compatibilidad |
| `compatibility-evidence` | `comparison.json`, `comparison.md`, `audit.json`, dump sintético |
| `smoke-logs` | salida completa de las 29 suites |
| `e2e-evidence` | `resultado.txt`, `resultado.json`, capturas de fallo |

La ausencia de artifacts no convierte un job fallido en exitoso.

## 8. Ejecución manual

Desde GitHub:

1. **Actions** → **CI SOL** → **Run workflow**.
2. Seleccione la rama y confirme.

Con GitHub CLI:

```bash
gh workflow run "CI SOL" --repo gidanodfu/SOL --ref <rama>
gh run list --repo gidanodfu/SOL --workflow ci.yml --limit 10
gh run watch <run-id> --repo gidanodfu/SOL
```

## 9. Reproducción local

```bash
cp .env.example .env
bash .github/scripts/prepare-ci-env.sh   # opcional: mismo entorno sintético

./deploy/scripts/test.sh php-lint
./deploy/scripts/test.sh validation
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh compatibility
./deploy/scripts/test.sh smoke
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
./deploy/scripts/test.sh audit
./deploy/scripts/test.sh http
E2E_WRITES=1 ./deploy/scripts/test.sh e2e
./deploy/scripts/dev.sh down
```

No ejecute `dev.sh down -v`. La compatibilidad local usa bases temporales y no
toca los volúmenes persistentes.

## 10. Diagnóstico

1. Abra el job fallido en **Actions**.
2. Descargue su artifact (`php-logs`, `mariadb-logs`, etc.).
3. Revise el último comando con código distinto de cero; los jobs usan
   `set -o pipefail`, por lo que `tee` no oculta el fallo.
4. Para MariaDB, consulte `mariadb-logs/up.log`, `migrate.log`, `seed.log`,
   `audit.log`, `compat.log`.
5. Para la comparación, revise `compatibility-evidence/comparison.md` y
   `comparison.json`.
6. Para E2E, revise `e2e-evidence/resultado.json` y las capturas `fail-*.png`.

## 11. Protección de ramas (configuración manual en GitHub)

En **Settings → Branches → Branch protection rules**, para `main`:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Checks obligatorios:
  - `PHP (sintaxis, PHPUnit y configuración)`
  - `Frontend (tests, lint y build)`
  - `MariaDB (migraciones, seeds y auditoría)`
  - `Compatibilidad MySQL 8.0 -> MariaDB 11.4`
  - `Smoke (29 suites)`
  - `E2E (Chromium Headless)`
  - `CI Validación global`
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow deletions.

Estos nombres deben coincidir exactamente con los `name` de `.github/workflows/ci.yml`.
No es posible aplicar esta configuración desde el repositorio local sin
autorización y permisos de administración.

## 12. Estado remoto

Validado en GitHub Actions sobre el commit `acd46dd`, rama
`refactor/mariadb-migration`:

- Run: `43107972526`.
- Resultado: **success**.
- Jobs: PHP, Frontend, MariaDB, Compatibilidad, Smoke, E2E y Validación global,
  todos en `success`.

Futuras ejecuciones deben comprobarse en **Actions → CI SOL**. El YAML por sí
solo no se considera evidencia de CI remoto.

## 13. Producción

El repositorio no incluye un stack de producción. CI valida el entorno de
desarrollo con MariaDB; el despliegue productivo requiere configuración
externa (TLS, red, secretos, respaldos, monitoreo) definida por cada
institución.
