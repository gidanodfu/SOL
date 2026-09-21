<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Usuarios, refresh tokens y auditoría (RF-01..RF-07, RF-61..RF-63, RN-10, RN-12).
 */
class CrearUsuariosYAuditoria extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'username'      => ['type' => 'VARCHAR', 'constraint' => 60],
            'password_hash' => ['type' => 'VARCHAR', 'constraint' => 255],
            // El rol se almacena aquí (fuente de verdad, RF-04/RN-07). No es editable desde el frontend.
            'rol'           => ['type' => 'ENUM', 'constraint' => ['admin', 'empresa', 'postulante']],
            'nombres'       => ['type' => 'VARCHAR', 'constraint' => 100],
            'apellidos'     => ['type' => 'VARCHAR', 'constraint' => 100],
            'email'         => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'telefono'      => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            // Inactivos no inician sesión (RF-06/RN-10); nunca se borra físicamente (RN-12).
            'estado'        => ['type' => 'ENUM', 'constraint' => ['activo', 'inactivo'], 'default' => 'activo'],
            'ultimo_acceso' => ['type' => 'DATETIME', 'null' => true],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('username', false, true);
        $this->forge->createTable('users', true);

        $this->forge->addField([
            'id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'user_id'    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'token_hash' => ['type' => 'VARCHAR', 'constraint' => 64],
            'expires_at' => ['type' => 'DATETIME'],
            'revocado'   => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('token_hash', false, true);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('user_refresh_tokens', true);

        // Auditoría de operaciones administrativas y cambios relevantes (RF-61..RF-63, RNF-11).
        $this->forge->addField([
            'id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'user_id'    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'accion'     => ['type' => 'VARCHAR', 'constraint' => 60],
            'entidad'    => ['type' => 'VARCHAR', 'constraint' => 60],
            'entidad_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'detalle'    => ['type' => 'JSON', 'null' => true],
            'ip'         => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['user_id', 'created_at']);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('auditoria', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('auditoria', true);
        $this->forge->dropTable('user_refresh_tokens', true);
        $this->forge->dropTable('users', true);
    }
}
