<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Auto-registro de empresas con aprobación municipal y tokens de activación.
 * La solicitud se conserva siempre (pendiente/aprobada/rechazada); al aprobar se
 * crean las filas reales en `users` y `empresas`, y el enlace de activación
 * permite al representante definir su contraseña (los datos nunca se borran).
 */
class CrearSolicitudesEmpresaYActivaciones extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'               => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'ruc'              => ['type' => 'CHAR', 'constraint' => 11],
            'razon_social'     => ['type' => 'VARCHAR', 'constraint' => 200],
            'nombre_comercial' => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'direccion'        => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'email'            => ['type' => 'VARCHAR', 'constraint' => 150],
            'telefono'         => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'representante'    => ['type' => 'VARCHAR', 'constraint' => 150],
            'estado'           => ['type' => 'ENUM', 'constraint' => ['pendiente', 'aprobada', 'rechazada'], 'default' => 'pendiente'],
            'motivo_rechazo'   => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'resuelto_por'     => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'resuelto_en'      => ['type' => 'DATETIME', 'null' => true],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
            'updated_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('ruc');
        $this->forge->addKey('estado');
        $this->forge->addForeignKey('resuelto_por', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('solicitudes_empresa', true);

        // Tokens de un solo uso para activar la cuenta de empresa (enlace).
        $this->forge->addField([
            'id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'user_id'    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'token_hash' => ['type' => 'CHAR', 'constraint' => 64],
            'tipo'       => ['type' => 'ENUM', 'constraint' => ['empresa'], 'default' => 'empresa'],
            // usado=1 también revoca tokens anteriores al regenerar un enlace.
            'usado'      => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'expira_en'  => ['type' => 'DATETIME'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('token_hash', false, true);
        $this->forge->addKey('user_id');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('activaciones', true);

        // Login por correo corporativo (además del RUC): WHERE username = ? OR email = ?
        $this->db->query('CREATE INDEX idx_users_email ON users (email)');
    }

    public function down(): void
    {
        $this->forge->dropTable('activaciones', true);
        $this->forge->dropTable('solicitudes_empresa', true);
        $this->db->query('DROP INDEX idx_users_email ON users');
    }
}
