<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Amplía las preferencias de interfaz por usuario: fuente, densidad y
 * accesibilidad (reducción de animaciones y alto contraste). Son preferencias
 * del usuario autenticado (nunca globales).
 */
class AgregarPreferenciasUi extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('ui_preferences', [
            'font'           => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => false, 'default' => 'default'],
            'density'        => ['type' => 'VARCHAR', 'constraint' => 20, 'null' => false, 'default' => 'normal'],
            'reduced_motion' => ['type' => 'TINYINT', 'constraint' => 1, 'null' => false, 'default' => 0],
            'high_contrast'  => ['type' => 'TINYINT', 'constraint' => 1, 'null' => false, 'default' => 0],
        ]);
    }

    public function down(): void
    {
        foreach (['font', 'density', 'reduced_motion', 'high_contrast'] as $columna) {
            $this->forge->dropColumn('ui_preferences', $columna);
        }
    }
}
