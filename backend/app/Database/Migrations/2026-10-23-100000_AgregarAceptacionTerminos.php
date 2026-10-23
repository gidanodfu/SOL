<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Evidencia de aceptación de los Términos y Condiciones.
 *
 * - `users`: cuentas de postulante creadas por registro manual.
 * - `solicitudes_empresa`: solicitudes de afiliación, antes de que exista un
 *   usuario de empresa. La evidencia queda ligada a la solicitud concreta.
 *
 * Las columnas son incrementales y compatibles con los registros históricos:
 * quedan NULL para las filas anteriores a esta funcionalidad.
 */
class AgregarAceptacionTerminos extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('terms_accepted_at', 'users')) {
            $this->forge->addColumn('users', [
                'terms_accepted_at' => [
                    'type'    => 'DATETIME',
                    'null'    => true,
                    'after'   => 'ultimo_acceso',
                ],
                'terms_version' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 20,
                    'null'       => true,
                    'after'      => 'terms_accepted_at',
                ],
            ]);
        }

        if (! $this->db->fieldExists('terms_accepted_at', 'solicitudes_empresa')) {
            $this->forge->addColumn('solicitudes_empresa', [
                'terms_accepted_at' => [
                    'type'    => 'DATETIME',
                    'null'    => true,
                    'after'   => 'estado',
                ],
                'terms_version' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 20,
                    'null'       => true,
                    'after'      => 'terms_accepted_at',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('terms_accepted_at', 'users')) {
            $this->forge->dropColumn('users', ['terms_accepted_at', 'terms_version']);
        }

        if ($this->db->fieldExists('terms_accepted_at', 'solicitudes_empresa')) {
            $this->forge->dropColumn('solicitudes_empresa', ['terms_accepted_at', 'terms_version']);
        }
    }
}
