<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

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
        $username = trim((string) (env('INITIAL_ADMIN_USERNAME') ?: 'MDJLO-SOL'));
        $password = (string) env('INITIAL_ADMIN_PASSWORD');

        if ($password === '') {
            echo "SystemSeeder: no se creó el administrador inicial.\n";
            echo "Defina INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD en backend/.env y\n";
            echo "vuelva a ejecutar: php spark db:seed SystemSeeder\n";

            return;
        }

        $now = date('Y-m-d H:i:s');

        $existe = $this->db->table('users')->where('username', $username)->countAllResults() > 0;
        if (! $existe) {
            $this->db->table('users')->insert([
                'username'      => $username,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'rol'           => 'admin',
                'proveedor'     => 'local',
                'nombres'       => 'Administrador',
                'apellidos'     => 'Municipal',
                'estado'        => 'activo',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);

            echo "SystemSeeder: administrador '{$username}' creado.\n";
        } else {
            echo "SystemSeeder: el administrador '{$username}' ya existe; no se modificó.\n";
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
}
