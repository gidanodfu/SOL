<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Presencia digital de la empresa (sitio web y redes sociales). Columnas
 * opcionales (NULL = no configurado). No se rellenan con datos ficticios.
 * Incremental: no modifica migraciones anteriores.
 */
class AgregarPresenciaDigitalEmpresa extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('empresas', [
            'website_url'   => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'info_adicional'],
            'instagram_url' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'website_url'],
            'facebook_url'  => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'instagram_url'],
            'tiktok_url'    => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'facebook_url'],
            'x_url'         => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'tiktok_url'],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('empresas', ['website_url', 'instagram_url', 'facebook_url', 'tiktok_url', 'x_url']);
    }
}
