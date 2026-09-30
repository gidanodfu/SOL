<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Imagen de las actividades (ferias, talleres, capacitaciones): se guarda en el
 * almacenamiento externo existente; MySQL solo conserva la referencia (key).
 */
class AgregarImagenActividades extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('actividades', [
            'imagen_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('actividades', 'imagen_key');
    }
}
