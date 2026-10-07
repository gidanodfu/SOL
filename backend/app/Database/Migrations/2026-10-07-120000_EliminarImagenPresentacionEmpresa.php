<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Elimina el flyer/"imagen de presentación" de empresa. La empresa conserva una
 * única imagen de identidad: `logo_key` (foto de perfil). Se verificó que
 * `imagen_key` no contenía datos (todas las filas en NULL) antes de retirarla.
 * Reversible: down() vuelve a crear la columna.
 */
class EliminarImagenPresentacionEmpresa extends Migration
{
    public function up(): void
    {
        if ($this->db->fieldExists('imagen_key', 'empresas')) {
            $this->forge->dropColumn('empresas', 'imagen_key');
        }
    }

    public function down(): void
    {
        if (! $this->db->fieldExists('imagen_key', 'empresas')) {
            $this->forge->addColumn('empresas', [
                'imagen_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'logo_key'],
            ]);
        }
    }
}
