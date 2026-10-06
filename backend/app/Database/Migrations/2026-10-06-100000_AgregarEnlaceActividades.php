<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Enlace externo de una actividad (feria, taller, capacitación, evento): URL
 * http(s) opcional asociada a la convocatoria. Se muestra como enlace en el
 * panel municipal y como texto (no navegable) en el portal del postulante.
 */
class AgregarEnlaceActividades extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('actividades', [
            'enlace' => ['type' => 'VARCHAR', 'constraint' => 300, 'null' => true],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('actividades', 'enlace');
    }
}
