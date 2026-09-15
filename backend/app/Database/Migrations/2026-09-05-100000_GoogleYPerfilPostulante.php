<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Registro/ingreso con Google (RF-18 ampliado). Guarda el proveedor y su id en
 * `users` para no duplicar cuentas, y permite postulantes sin DNI (el DNI sigue
 * siendo obligatorio en el registro manual). El resto del perfil lo completa el
 * ciudadano antes de postularse (regla de perfil completo).
 */
class GoogleYPerfilPostulante extends Migration
{
    public function up(): void
    {
        // Proveedor de identidad: 'local' (DNI/correo con contraseña) o 'google'.
        $this->db->query("ALTER TABLE users ADD COLUMN proveedor ENUM('local','google') NOT NULL DEFAULT 'local' AFTER rol");
        $this->db->query('ALTER TABLE users ADD COLUMN proveedor_id VARCHAR(100) NULL AFTER proveedor');
        $this->db->query('CREATE INDEX idx_users_proveedor_id ON users (proveedor_id)');

        // Los postulantes creados por Google aún no tienen DNI.
        $this->db->query('ALTER TABLE postulantes MODIFY dni CHAR(8) NULL');
    }

    public function down(): void
    {
        $this->db->query('DROP INDEX idx_users_proveedor_id ON users');
        $this->db->query('ALTER TABLE users DROP COLUMN proveedor_id');
        $this->db->query("ALTER TABLE users DROP COLUMN proveedor");
        $this->db->query('ALTER TABLE postulantes MODIFY dni CHAR(8) NOT NULL');
    }
}
