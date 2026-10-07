<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Foto de perfil del postulante (RF-19 ampliado). Solo metadatos: el binario
 * normalizado (800x800) vive en Storage (StorageService), igual que el CV y las
 * imágenes de empresa. No se duplica el logo/imagen de empresa (ya existen
 * logo_key/imagen_key); este campo es exclusivo del postulante.
 */
class AgregarFotoPostulante extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('postulantes', [
            'foto_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'estudios'],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('postulantes', 'foto_key');
    }
}
