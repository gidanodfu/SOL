# Despliegue de SOL

La configuración de entorno es única y vive en `.env` en la raíz del repositorio.
`.env.example` es la plantilla versionada. No hay `.env` dentro de `backend/` ni
`frontend/`.

## Estructura

```text
SOL/
├── .env                 # privado, no versionado
├── .env.example         # plantilla
├── backend/Dockerfile
├── frontend/Dockerfile
└── deploy/
    ├── compose.yaml     # servicios base
    ├── compose.dev.yaml # desarrollo
    ├── compose.prod.yaml# producción + Nginx
    ├── nginx/           # plantillas, render y certificados
    └── scripts/         # bootstrap, deploy, dev, validate, test, backup
```

## Servicios

- `db`: MySQL 8.0. Producción no publica puertos; desarrollo usa `127.0.0.1:3307`.
- `backend`: PHP-FPM 8.4 con CodeIgniter 4. En desarrollo ejecuta `php spark serve`.
- `frontend`: build de Vite servido por Nginx; en desarrollo ejecuta Vite.
- `nginx`: solo producción; enruta el frontend y `/api`/`/health` al backend.
- `adminer`: solo desarrollo, en `127.0.0.1:8082`.

La red interna es `sol_<proyecto>_internal` (por defecto `sol_dev_internal`).
Los volúmenes son `sol_<proyecto>_mysql_data` y
`sol_<proyecto>_backend_writable`. En producción se agrega
`sol_<proyecto>_nginx_conf`.

## Comandos

```bash
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh status
./deploy/scripts/dev.sh logs backend
./deploy/scripts/dev.sh migrate       # explícito
./deploy/scripts/dev.sh seed          # explícito; modifica datos
./deploy/scripts/dev.sh down          # conserva volúmenes
./deploy/scripts/validate.sh --runtime
./deploy/scripts/test.sh all
./deploy/scripts/backup.sh dev

./deploy/scripts/bootstrap.sh --prod  # instalación nueva en servidor
./deploy/scripts/deploy.sh            # actualización de una instalación existente
```

Los scripts localizan la raíz del repositorio y pasan `--env-file` a Compose,
por lo que funcionan desde cualquier directorio.

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
certificado y la clave correspondan al dominio y recargue Nginx.

## Datos y respaldos

`backup.sh` usa `mysqldump` consistente y respalda el volumen `backend_writable`.
El destino por defecto es `$HOME/sol-backups`; use `BACKUP_DIR` para cambiarlo.
Los archivos quedan con permisos `600` y fuera del repositorio.

No se ejecuta `docker compose down -v`, `docker volume prune` ni
`docker system prune` en los procedimientos. `dev.sh down` y `deploy.sh`
conservan los volúmenes.

## Entorno filtrado del backend

Los scripts generan `deploy/runtime/backend.env` (permisos `600`, ignorado por
Git). El servicio backend lo consume mediante `BACKEND_ENV_FILE`; no recibe la
contraseña root de MySQL, las credenciales iniciales, variables `VITE_*` ni
configuración de Nginx/TLS. Use los scripts para operar el stack. Si ejecuta
Compose manualmente, defina `BACKEND_ENV_FILE="$PWD/deploy/runtime/backend.env"`.
