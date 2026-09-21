<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Normaliza ofertas en estados heredados del flujo anterior de validación
 * municipal (2026-09): `pendiente` → `publicada` y `rechazada` → `borrador`.
 *
 * El flujo vigente es publicación directa por la empresa (borrador → publicada
 * → cerrada); la aprobación/rechazo municipal fue retirada. El ENUM conserva
 * los valores históricos para no romper datos antiguos, pero ya no se generan.
 * Idempotente: filtra por estado. La reversión no es posible (down no-op).
 */
class NormalizarOfertasHeredadas extends Migration
{
    public function up(): void
    {
        $this->db->query(
            "UPDATE ofertas
             SET estado = 'publicada',
                 fecha_publicacion = COALESCE(fecha_publicacion, DATE(created_at)),
                 fecha_cierre = CASE
                     WHEN fecha_cierre IS NULL OR fecha_cierre < CURDATE()
                     THEN DATE_ADD(CURDATE(), INTERVAL 30 DAY)
                     ELSE fecha_cierre
                 END,
                 motivo_rechazo = NULL,
                 validado_por = NULL,
                 fecha_validacion = NULL,
                 updated_at = NOW()
             WHERE estado = 'pendiente'"
        );

        $this->db->query(
            "UPDATE ofertas
             SET estado = 'borrador',
                 motivo_rechazo = NULL,
                 validado_por = NULL,
                 fecha_validacion = NULL,
                 updated_at = NOW()
             WHERE estado = 'rechazada'"
        );
    }

    public function down(): void
    {
        // Irreversible por diseño: no se puede distinguir una oferta normalizada
        // de una creada ya en borrador/publicada.
    }
}
