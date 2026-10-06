<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Preferencias de interfaz por usuario (tema cromático + modo claro/oscuro/sistema).
 * El backend es la fuente de verdad; el frontend solo cachea localmente.
 */
class CrearUiPreferences extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'user_id'    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'theme'      => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'blue'],
            'mode'       => ['type' => 'VARCHAR', 'constraint' => 10, 'default' => 'dark'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('user_id', true);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ui_preferences', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('ui_preferences', true);
    }
}
