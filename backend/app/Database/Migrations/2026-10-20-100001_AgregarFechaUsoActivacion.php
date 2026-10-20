<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Fecha real de consumo del enlace de activación. `usado=1` ya invalida el
 * token, pero también se usa para revocar enlaces anteriores; `usado_en`
 * distingue un enlace realmente consumido de uno solo revocado.
 */
class AgregarFechaUsoActivacion extends Migration
{
    public function up(): void
    {
        $this->db->query('ALTER TABLE activaciones ADD COLUMN usado_en DATETIME NULL AFTER usado');

        // Compatibilidad con activaciones históricas: la auditoría conserva
        // la fecha real aunque la cuenta se haya desactivado después.
        $this->db->query(
            'UPDATE activaciones a
             INNER JOIN empresas e ON e.user_id = a.user_id
             INNER JOIN auditoria au
                ON au.accion = \'activar_cuenta\'
               AND au.entidad = \'empresa\'
               AND au.entidad_id = e.id
             SET a.usado_en = au.created_at
             WHERE a.usado = 1 AND a.usado_en IS NULL'
        );

        // Cuentas ya activas sin auditoría: se conserva una referencia segura.
        $this->db->query(
            'UPDATE activaciones a
             INNER JOIN users u ON u.id = a.user_id
             SET a.usado_en = a.created_at
             WHERE a.usado = 1 AND a.usado_en IS NULL AND u.estado = \'activo\''
        );
    }

    public function down(): void
    {
        $this->forge->dropColumn('activaciones', 'usado_en');
    }
}
