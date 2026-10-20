<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Tipo de documento del postulante. `postulantes.dni` se conserva como el
 * número documental (compatibilidad con datos/API existentes), pero se amplía
 * para admitir carnet de extranjería. Los documentos existentes quedan como DNI.
 */
class AgregarTipoDocumentoPostulante extends Migration
{
    public function up(): void
    {
        $this->db->query(
            "ALTER TABLE postulantes
             ADD COLUMN tipo_documento ENUM('DNI','CE') NULL AFTER dni,
             MODIFY COLUMN dni VARCHAR(20) NULL"
        );

        $this->db->query("UPDATE postulantes SET tipo_documento = 'DNI' WHERE dni IS NOT NULL AND tipo_documento IS NULL");
    }

    public function down(): void
    {
        // No se reduce `dni` a CHAR(8): podría truncar un carnet ya guardado.
        $this->forge->dropColumn('postulantes', 'tipo_documento');
    }
}
