<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;
use App\Validation\Validador;
use RuntimeException;

/**
 * Datos iniciales de la instalación (estructura → `php spark migrate`).
 *
 * Crea un único administrador institucional y las categorías de referencia:
 * - Usuario/contraseña desde `INITIAL_ADMIN_USERNAME` e `INITIAL_ADMIN_PASSWORD`
 *   del `.env` (la contraseña nunca se escribe en el código; se guarda con hash).
 * - Idempotente: si el usuario o la categoría ya existen, no se duplican.
 *
 * Los datos ficticios de prueba viven en `DatosPruebaSeeder` (fixtures) y
 * `DatosMasivosSeeder` (carga masiva); nunca en este seeder.
 */
class SystemSeeder extends Seeder
{
    private const CATEGORIAS = [
        'Administración', 'Comercio', 'Construcción', 'Gastronomía', 'Logística',
        'Salud', 'Tecnología', 'Industria', 'Servicios', 'Transporte',
    ];

    public function run(): void
    {
        try {
            [$username, $password] = self::validarCredenciales(
                env('INITIAL_ADMIN_USERNAME'),
                env('INITIAL_ADMIN_PASSWORD'),
            );
        } catch (RuntimeException $e) {
            self::abortar($e->getMessage());
        }

        try {
            $this->sembrar($username, $password);
        } catch (\Throwable $e) {
            log_message('error', 'SystemSeeder: fallo de base de datos: {mensaje}', ['mensaje' => $e->getMessage()]);
            self::abortar(
                'Bootstrap cancelado: falló la creación o verificación del administrador inicial. '
                . 'Revise los logs del backend y la conexión a la base de datos.',
            );
        }
    }

    private function sembrar(string $username, string $password): void
    {
        $now = date('Y-m-d H:i:s');

        $existente = $this->db->table('users')->where('username', $username)->get()->getRowArray();
        if ($existente !== null) {
            if (($existente['rol'] ?? '') !== 'admin' || ($existente['estado'] ?? '') !== 'activo' || empty($existente['password_hash'])) {
                self::abortar(
                    "Bootstrap cancelado: el usuario INITIAL_ADMIN_USERNAME ya existe, pero no es un administrador activo. "
                    . 'No se modificó la cuenta. Use el procedimiento separado de recuperación de credenciales.',
                );
            }

            if (empty($existente['perfil_municipal'])) {
                $this->db->table('users')->where('id', (int) $existente['id'])->update([
                    'perfil_municipal' => 'admin',
                    'updated_at'       => $now,
                ]);
            }

            echo "SystemSeeder: el administrador '{$username}' ya existe; no se modificó su contraseña.\n";
        } else {
            $this->db->table('users')->insert([
                'username'      => $username,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'rol'           => 'admin',
                'perfil_municipal' => 'admin',
                'proveedor'     => 'local',
                'nombres'       => 'Administrador',
                'apellidos'     => 'Municipal',
                'estado'        => 'activo',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);

            $creado = $this->db->table('users')->where('username', $username)->get()->getRowArray();
            if (
                $creado === null
                || ($creado['rol'] ?? '') !== 'admin'
                || ($creado['perfil_municipal'] ?? '') !== 'admin'
                || ($creado['estado'] ?? '') !== 'activo'
                || ($creado['proveedor'] ?? '') !== 'local'
                || empty($creado['password_hash'])
            ) {
                self::abortar(
                    'Bootstrap cancelado: no se pudo verificar la creación del administrador inicial. '
                    . 'Revise los logs del backend y vuelva a intentarlo.',
                );
            }

            echo "SystemSeeder: administrador '{$username}' creado y verificado.\n";
        }

        // Categorías de referencia de las ofertas (idempotente por nombre).
        foreach (self::CATEGORIAS as $nombre) {
            $existeCategoria = $this->db->table('categorias')->where('nombre', $nombre)->countAllResults() > 0;
            if (! $existeCategoria) {
                $this->db->table('categorias')->insert(['nombre' => $nombre, 'activo' => 1]);
            }
        }

        echo 'SystemSeeder: ' . count(self::CATEGORIAS) . " categorías verificadas.\n";
    }

    /**
     * Falla el proceso con código distinto de cero. Los seeders de CI4 pueden
     * mostrar una excepción y terminar con éxito; el bootstrap necesita un
     * código de salida verificable.
     */
    private static function abortar(string $mensaje): never
    {
        fwrite(STDERR, $mensaje . PHP_EOL);
        exit(1);
    }

    /**
     * Valida las credenciales del administrador inicial sin tocar la base de datos.
     *
     * @return array{0: string, 1: string} usuario y contraseña normalizados
     *
     * @throws RuntimeException si falta o no cumple la política vigente
     */
    public static function validarCredenciales(mixed $usernameRaw, mixed $passwordRaw): array
    {
        $username = is_string($usernameRaw) ? trim($usernameRaw) : '';
        if ($username === '') {
            throw new RuntimeException(
                'Bootstrap cancelado: falta INITIAL_ADMIN_USERNAME. '
                . 'Defina un usuario administrador en el .env de la raíz antes de ejecutar la inicialización.',
            );
        }
        if (mb_strlen($username) > 60 || preg_match('/[\x00-\x1F\x7F]/', $username) === 1) {
            throw new RuntimeException(
                'Bootstrap cancelado: INITIAL_ADMIN_USERNAME no es válido. '
                . 'Use un usuario no vacío de hasta 60 caracteres, sin caracteres de control. '
                . 'Corrija la variable en el .env de la raíz.',
            );
        }

        $password = is_string($passwordRaw) ? $passwordRaw : '';
        if ($password === '') {
            throw new RuntimeException(
                'Bootstrap cancelado: falta INITIAL_ADMIN_PASSWORD. '
                . 'Defina una contraseña segura en el .env de la raíz antes de ejecutar la inicialización.',
            );
        }
        if (! Validador::esContrasenaSegura($password)) {
            throw new RuntimeException(
                'Bootstrap cancelado: INITIAL_ADMIN_PASSWORD no cumple la política de contraseñas. '
                . 'Debe contener al menos 8 caracteres, una letra, un número y un símbolo especial. '
                . 'Corrija la variable en el .env de la raíz y vuelva a ejecutar la inicialización.',
            );
        }

        return [$username, $password];
    }
}
