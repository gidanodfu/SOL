# Despliegue de SOL

Docker es la única vía oficial de desarrollo y operación. La configuración de
entorno es única y vive en `.env` en la raíz del repositorio. `.env.example` es
la plantilla versionada. No hay `.env` dentro de `backend/` ni `frontend/`.

## Estructura

```text
SOL/
├── .env                    # privado, no versionado
├── .env.example            # plantilla sin secretos
├── backend/
│   ├── Dockerfile
│   ├── php.ini             # límites de subida/memoria comunes
│   └── php.prod.ini        # OPcache de producción
├── frontend/
│   ├── Dockerfile
│   └── nginx.conf
└── deploy/
    ├── compose.yaml        # servicios base
    ├── compose.dev.yaml    # desarrollo
    ├── compose.prod.yaml   # producción + Nginx
    ├── nginx/              # plantillas, render y certificados
    └── scripts/            # bootstrap, deploy, dev, validate, test, backup, restore
```

## Requisitos del host

- Docker Engine >= 24 y Docker Compose >= 2.24 (`docker compose`).
- Git, shell POSIX, `awk`, `grep`, `sed`, `stat` y `curl` para diagnóstico.
- No se requiere PHP, Composer, Node.js, npm, MySQL ni `node_modules` en el host.

## Servicios

- `db`: MySQL 8.0.46. Producción no publica puertos; desarrollo usa
  `127.0.0.1:3307`.
- `backend`: PHP-FPM 8.4.27 con CodeIgniter 4. En desarrollo ejecuta
  `php spark serve`; en producción, PHP-FPM.
- `frontend`: build de Vite servido por Nginx en producción; en desarrollo
  ejecuta Vite con recarga automática.
- `nginx`: solo producción; enruta el frontend y `/api`/`/health` al backend.
- `adminer`: opcional en desarrollo; perfil `tools`, en `127.0.0.1:8082`.

La red es `sol_<proyecto>_internal`; los volúmenes son
`sol_<proyecto>_mysql_data`, `sol_<proyecto>_backend_writable` y, en producción,
`sol_<proyecto>_nginx_conf`. El nombre se toma de `COMPOSE_PROJECT_NAME` y los
scripts lo pasan explícitamente a Compose. Producción rechaza `sol_dev`.

Desarrollo publica únicamente en `127.0.0.1` los puertos 5173, 8080, 3307 y
8082. Producción publica únicamente 80/443 en Nginx; PHP-FPM y MySQL no
publican puertos al exterior.

## Comandos

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh shell backend
./deploy/scripts/dev.sh exec backend php spark routes
./deploy/scripts/dev.sh db
./deploy/scripts/dev.sh tools              # Adminer opcional
./deploy/scripts/dev.sh migrate            # explícito
./deploy/scripts/dev.sh migration-status
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes  # solo pruebas
./deploy/scripts/dev.sh down               # conserva volúmenes

./deploy/scripts/validate.sh --dev
./deploy/scripts/validate.sh --prod
./deploy/scripts/validate.sh --build
./deploy/scripts/validate.sh --runtime
./deploy/scripts/test.sh all
./deploy/scripts/test.sh backend
./deploy/scripts/test.sh frontend
./deploy/scripts/test.sh http
./deploy/scripts/test.sh smoke

./deploy/scripts/backup.sh dev
./deploy/scripts/backup.sh prod
./deploy/scripts/restore.sh --help
./deploy/scripts/bootstrap.sh --prod --authorize   # instalación nueva
./deploy/scripts/deploy.sh                          # actualización existente
```

Los scripts localizan la raíz del repositorio y pasan `--env-file` y
`--project-name` a Compose, por lo que funcionan desde cualquier directorio.
No instalan dependencias en el host.

## Imágenes y actualización de versiones

Versiones fijadas actualmente:

| Componente | Imagen |
|---|---|
| Backend | `php:8.4.27-fpm-alpine3.23` |
| Composer | `composer:2.8.12` |
| Frontend | `node:22.23.4-alpine` |
| Servidor frontend | `nginx:1.27.5-alpine` |
| Base de datos | `mysql:8.0.46` |
| Administración dev | `adminer:5.3.0` |
| Utilidades temporales | `alpine:3.21` |

Procedimiento autorizado para actualizar:

1. Revisar notas de la versión y compatibilidad con CodeIgniter/React.
2. Cambiar la etiqueta exacta en el Dockerfile o Compose correspondiente.
3. Ejecutar `./deploy/scripts/validate.sh --build --build-prod` con el `.env` de producción.
4. Ejecutar `./deploy/scripts/test.sh all`.
5. Probar en un entorno aislado antes de `deploy.sh`.

Las etiquetas fijas reducen variaciones, pero no garantizan reproducibilidad
absoluta: el registro de imágenes, las dependencias de Composer/npm y los
servicios externos siguen siendo fuentes externas. No se usan etiquetas
`latest` en los builds oficiales.

## Nginx y TLS

`deploy/nginx/render.sh` corre dentro del contenedor y renderiza la plantilla
según `NGINX_MODE`:

- `http`: HTTP directo o TLS terminado por un proxy externo.
- `same-domain`: `https://APP_DOMAIN` y `https://APP_DOMAIN/api`.
- `subdomain`: `https://APP_DOMAIN` y `https://API_DOMAIN`.

Los certificados reales se colocan en `TLS_CERTS_DIR` (por defecto
`deploy/nginx/certs/`): `fullchain.pem` y `privkey.pem`. No se versionan.
El contenedor los monta como solo lectura. Ver `deploy/nginx/README.md`.

No se generan certificados automáticamente. Para Let's Encrypt, emita/renueve
en el host, copie los archivos al directorio indicado, compruebe que el
certificado y la clave correspondan al dominio y recargue Nginx mediante el
procedimiento de despliegue. Los modos HTTPS envían HSTS; `http` no.

## Datos, respaldos y restauración

`backup.sh` usa `mysqldump` consistente y respalda el volumen
`backend_writable`. El destino por defecto es `$HOME/sol-backups`; use
`BACKUP_DIR` para cambiarlo. Los archivos quedan con permisos `600`, fuera del
repositorio, con manifiesto y SHA-256. No se sobrescriben. El servicio `db` debe
estar en ejecución (`dev.sh up` o `deploy.sh` lo asegura).

`restore.sh` es una operación separada y destructiva: exige `--env`, `--db`,
`--confirm "RESTORE:<proyecto>:<entorno>"` y, para producción,
`--allow-production`. Crea un respaldo de seguridad antes de restaurar, detiene
la aplicación, restaura el SQL, verifica tablas y `users`, opcionalmente
restaura `writable` y vuelve a levantar los servicios. No borra volúmenes ni
restaura automáticamente si falla.

Los CV alojados en Supabase no están en el volumen local; respáldelos también
desde el proveedor. Practique la restauración en un proyecto/volumen
desechable, nunca sobre los volúmenes reales.

No se ejecuta `docker compose down -v`, `docker volume prune`,
`docker system prune --volumes` ni `docker volume rm` en los procedimientos.
`dev.sh down`, `deploy.sh` y `restore.sh` conservan los volúmenes.

## Entorno filtrado del backend

Los scripts generan `deploy/runtime/backend.env` (permisos `600`, ignorado por
Git). El servicio backend lo consume mediante `BACKEND_ENV_FILE`; no recibe la
contraseña root de MySQL, las credenciales iniciales, variables `VITE_*` ni
configuración de Nginx/TLS. Use los scripts para operar el stack. Si ejecuta
Compose manualmente, defina `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"`.
