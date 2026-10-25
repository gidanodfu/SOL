<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Marca de retiro voluntario del postulante.
 *
 * `activo = 0` no identifica por sí solo quién originó la desactivación: la
 * empresa también puede desactivar una postulación. Esta columna distingue el
 * retiro del postulante para impedir que la empresa reactive ese mismo registro.
 *
 * Los registros históricos quedan con `retirada_postulante = 0` porque no existe
 * evidencia fiable de quién los desactivó; se conservan sin bloquear su
 * reactivación y no se infiere un retiro a partir de `activo`.
 */
class AgregarRetiroPostulante extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('retirada_postulante', 'postulaciones')) {
            $this->forge->addColumn('postulaciones', [
                'retirada_postulante' => [
                    'type'       => 'TINYINT',
                    'constraint' => 1,
                    'default'    => 0,
                    'null'       => false,
                    'after'      => 'activo',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('retirada_postulante', 'postulaciones')) {
            $this->forge->dropColumn('postulaciones', 'retirada_postulante');
        }
    }
}
