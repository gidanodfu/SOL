# Migración de MySQL 8.0 a MariaDB 11.4

> Procedimiento operativo para el entorno local de SOL. No se aplica a datos de
> producción sin una ventana de mantenimiento y un respaldo verificado.

## 1. Versión seleccionada

- **MariaDB 11.4.13 LTS**, imagen Docker `mariadb:11.4.13`.
- Es la última revisión de la serie 11.4 LTS, mantenida hasta 2029.
- Usa el protocolo de MySQL, por lo que CodeIgniter 4 mantiene el driver
  `MySQLi` sin cambios. No existe un driver `MariaDBi`.
- Motor InnoDB, `utf8mb4` y `utf8mb4_general_ci`, igual que el esquema previo.

## 2. Cambios de infraestructura

| Elemento | Antes | Ahora |
|---|---|---|
| Imagen | `mysql:8.0.46` | `mariadb:11.4.13` |
| Variables | `MYSQL_*` | `MARIADB_*` |
| Volumen | `mysql_data` | `mariadb_data` |
| Cliente | `mysql` / `mysqldump` | `mariadb` / `mariadb-dump` |
| Healthcheck | `mysqladmin ping` | `healthcheck.sh --connect --innodb_initialized` |

El volumen `mysql_data` se conserva declarado e intacto. Nunca debe montarse
sobre `/var/lib/mysql` de MariaDB: los formatos de datos son distintos.

## 3. Compatibilidad verificada

| Elemento | Resultado |
|---|---|
| `JSON` | MariaDB lo implementa como `LONGTEXT` + `CHECK (json_valid(...))` |
| Columnas `STORED` | Soportadas |
| Columnas `VIRTUAL` indexadas | Soportadas |
| Índices únicos sobre columnas generadas | Soportados |
| `INSERT ... ON DUPLICATE KEY UPDATE` con `VALUES()` | Soportado |
| `GET_LOCK` / `RELEASE_LOCK` | Soportados |
| `FOR UPDATE` | Soportado |
| `REGEXP_REPLACE` | Soportado |
| `GROUP_CONCAT`, agregaciones, subconsultas | Soportados |
| `utf8mb4_general_ci` | Soportado |
| `DECIMAL` como cadena con `MySQLi` | Igual que en MySQL |

### Ajuste obligatorio en columnas generadas

MariaDB rechaza una expresión generada que devuelve directamente una columna
`CHAR`, porque el resultado depende de `PAD_CHAR_TO_FULL_LENGTH`. La migración
`CrearIdentidadesReservadas` usa ahora `RTRIM(ruc)`:

```sql
GENERATED ALWAYS AS (
  CASE WHEN estado IN ('pendiente','aprobada') THEN RTRIM(ruc) ELSE NULL END
) STORED
```

El valor es idéntico porque el RUC no tiene espacios de relleno. El índice
único `uq_solicitud_ruc_activa` se conserva.

## 4. Instalación limpia

```bash
cp .env.example .env
chmod 600 .env
# Complete DB_PASSWORD, DB_ROOT_PASSWORD, jwt.secret,
# encryption.key e INITIAL_ADMIN_*.

./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh migrate
./deploy/scripts/dev.sh seed SystemSeeder --yes   # solo si no existe el admin
./deploy/scripts/dev.sh seed DatosPruebaSeeder --yes
```

Verifique:

```bash
docker exec sol_dev-db-1 mariadb -uroot -p"$DB_ROOT_PASSWORD" \
  -e "SELECT VERSION(); SHOW CREATE TABLE solicitudes_empresa\G"
```

## 5. Actualización desde una instalación MySQL existente

No se reutiliza el volumen de MySQL. El traslado es lógico:

1. **Conservar** el volumen `sol_dev_mysql_data` y no montarlo en MariaDB.
2. **Levantar MySQL** con el proyecto anterior (o una copia) y generar un dump
   **solo de datos**, sin DDL:

   ```bash
   docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" <mysql> \
     mysqldump -uroot --single-transaction --quick --no-create-info \
     --skip-triggers --skip-routines --default-character-set=utf8mb4 \
     --ignore-table="$MYSQL_DATABASE.migrations" \
     "$MYSQL_DATABASE" > /ruta/segura/sol-datos.sql
   ```

   El dump no debe contener `CREATE TABLE` ni definiciones de columnas
   generadas. Se excluye la tabla `migrations` para conservar el estado de
   migraciones que creó el esquema MariaDB; de lo contrario sus filas chocan
   con las ya insertadas por `spark migrate`.
3. **Crear el esquema MariaDB** desde cero con las migraciones actuales:

   ```bash
   ./deploy/scripts/dev.sh up
   ./deploy/scripts/dev.sh migrate
   ```

4. **Importar los datos** desactivando temporalmente las claves foráneas:

   ```bash
   docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" <mariadb> \
     mariadb -uroot "$MARIADB_DATABASE" <<'SQL'
   SET FOREIGN_KEY_CHECKS=0;
   SOURCE /ruta/segura/sol-datos.sql;
   SET FOREIGN_KEY_CHECKS=1;
   SQL
   ```

   Si el cliente no puede leer el archivo dentro del contenedor, use
   `docker exec -i ... mariadb -uroot "$MARIADB_DATABASE" < sol-datos.sql`.
5. **Verificar** conteos, claves foráneas, columnas generadas e índices únicos:

   ```sql
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM postulaciones WHERE activo = 1;
   SHOW CREATE TABLE solicitudes_empresa\G
   ```

6. **Probar** login, dashboards, ofertas, postulaciones y reportes antes de
   retirar la instancia MySQL anterior.

Las tablas `*_legado` y el historial de migraciones se conservan tal como
viajan en el dump de datos.

## 6. Respaldo y restauración

Los scripts usan el cliente MariaDB dentro del contenedor:

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/restore.sh --env dev \
  --db "$HOME/sol-backups/sol-db-<fecha>.sql" \
  --files "$HOME/sol-backups/sol-writable-<fecha>.tar.gz" \
  --confirm "RESTORE:sol_dev:dev"
```

- El dump incluye rutinas, triggers y `CREATE TABLE` con las columnas
  generadas ya compatibles.
- Se guardan permisos `600`, manifiesto y SHA-256.
- `restore.sh` omite el respaldo de seguridad si la base destino está vacía,
  para permitir restaurar en una instancia limpia.
- `dev.sh down` y `restore.sh` no eliminan volúmenes.

## 7. Pruebas

```bash
./deploy/scripts/test.sh validation
./deploy/scripts/test.sh all
./deploy/scripts/test.sh smoke
```

La suite smoke crea un `mariadb:11.4.13` temporal en `tmpfs`, un esquema por
suite y ejecuta migraciones y seeders. Incluye `test_mariadb_compat.sh`, que
verifica versión, InnoDB, columnas generadas, índices únicos, JSON y las
restricciones críticas de SOL.

## 8. Auditoría y reporte

```bash
./deploy/scripts/test.sh audit
```

Ejecuta `tests/tools/audit_database_integrity.php` contra la base activa. El
auditor no modifica datos, revisa motor, charset/collation, tablas, columnas
generadas, índices únicos, JSON, FK y datos críticos, y devuelve código distinto
de cero ante errores.

El informe de la validación integral está en
[`reports/mariadb-validation-report.md`](reports/mariadb-validation-report.md).

## 9. Recuperación y reversión

### Si falla la importación

1. Detener backend y frontend:

   ```bash
   docker stop sol_dev-backend-1 sol_dev-frontend-1
   ```

2. Restaurar el respaldo de MariaDB o volver a crear el esquema con
   `./deploy/scripts/dev.sh migrate`.
3. Volver a importar el dump de datos.
4. Ejecutar `./deploy/scripts/test.sh audit` y `./deploy/scripts/test.sh http`.
5. Levantar de nuevo:

   ```bash
   ./deploy/scripts/dev.sh up --no-build
   ```

### Si se necesita volver temporalmente a MySQL

El volumen `sol_dev_mysql_data` se conserva intacto. No se debe montar en
MariaDB. Para una reversión operativa:

1. No eliminar `sol_dev_mariadb_data` ni `sol_dev_mysql_data`.
2. Revisar el commit anterior a la migración y restaurar temporalmente
   `deploy/compose.yaml` con `mysql:8.0.46` y el volumen `mysql_data`.
3. Detener el stack actual sin borrar volúmenes:

   ```bash
   ./deploy/scripts/dev.sh down
   ```

4. Levantar el stack MySQL anterior y validar el acceso.
5. Conservar MariaDB como copia de solo lectura hasta confirmar la reversión.

La reversión completa no se ha ejecutado en esta validación porque el volumen
MySQL es la fuente de comparación y debe permanecer intacto; el procedimiento
está documentado para una ventana de mantenimiento autorizada.

## 10. Operaciones destructivas

Nunca ejecutar durante la migración:

```text
docker compose down -v
docker volume rm sol_dev_mysql_data
docker volume rm sol_dev_mariadb_data
docker volume prune
docker system prune --volumes
```

Los respaldos lógicos son el mecanismo de recuperación. Los volúmenes son la
última copia de seguridad y no deben eliminarse hasta que la migración esté
aprobada y exista un respaldo verificado fuera del host.
