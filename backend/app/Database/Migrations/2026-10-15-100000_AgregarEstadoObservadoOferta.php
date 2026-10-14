<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Ciclo de revisión de ofertas: incorpora el estado `observada` (la empresa debe
 * corregir) y la observación persistente del administrador. `rechazada` ya
 * existía y se mantiene (pasa a ser terminal en el servicio).
 *
 * Incremental: no modifica migraciones anteriores ni los datos existentes.
 */
class AgregarEstadoObservadoOferta extends Migration
{
    public function up(): void
    {
        // Amplía el ENUM conservando los valores anteriores.
        $this->db->query(
            "ALTER TABLE ofertas
             MODIFY COLUMN estado ENUM('borrador','pendiente','publicada','cerrada','rechazada','observada')
             NOT NULL DEFAULT 'borrador'"
        );

        $this->forge->addColumn('ofertas', [
            'observacion'       => ['type' => 'TEXT', 'null' => true, 'after' => 'motivo_rechazo'],
            'observado_por'     => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true, 'after' => 'observacion'],
            'fecha_observacion' => ['type' => 'DATETIME', 'null' => true, 'after' => 'observado_por'],
        ]);

        $this->db->query(
            'ALTER TABLE ofertas
             ADD CONSTRAINT fk_ofertas_observado_por
             FOREIGN KEY (observado_por) REFERENCES users(id) ON DELETE SET NULL ON UPDATE SET NULL'
        );
    }

    public function down(): void
    {
        // Las ofertas observadas vuelven a revisión antes de reducir el ENUM.
        $this->db->query("UPDATE ofertas SET estado = 'pendiente' WHERE estado = 'observada'");

        $this->db->query('ALTER TABLE ofertas DROP FOREIGN KEY fk_ofertas_observado_por');
        $this->forge->dropColumn('ofertas', ['observacion', 'observado_por', 'fecha_observacion']);

        $this->db->query(
            "ALTER TABLE ofertas
             MODIFY COLUMN estado ENUM('borrador','pendiente','publicada','cerrada','rechazada')
             NOT NULL DEFAULT 'borrador'"
        );
    }
}
