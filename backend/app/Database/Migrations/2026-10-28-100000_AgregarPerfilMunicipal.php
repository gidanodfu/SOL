<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;
use RuntimeException;

/**
 * Perfil municipal de las cuentas con `rol = admin`.
 *
 * `rol` sigue siendo la identidad principal (admin/empresa/postulante) y las
 * rutas municipales conservan `rol:admin`. `perfil_municipal` diferencia las
 * facultades del personal municipal sin romper la autenticación existente.
 */
class AgregarPerfilMunicipal extends Migration
{
    public function up(): void
    {
        if (! $this->db->fieldExists('perfil_municipal', 'users')) {
            $this->forge->addColumn('users', [
                'perfil_municipal' => [
                    'type'       => 'ENUM',
                    'constraint' => ['admin', 'moderador', 'solo_lectura'],
                    'null'       => true,
                    'after'      => 'rol',
                ],
            ]);
        }

        // Preserva el acceso de todas las cuentas municipales existentes. Las
        // cuentas de empresa y postulante se dejan intactas (perfil NULL).
        $this->db->table('users')
            ->where('rol', 'admin')
            ->where('perfil_municipal IS NULL', null, false)
            ->update(['perfil_municipal' => 'admin']);

        $sinPerfil = $this->db->table('users')
            ->where('rol', 'admin')
            ->where('perfil_municipal IS NULL', null, false)
            ->countAllResults();

        if ($sinPerfil > 0) {
            throw new RuntimeException(
                "La migración dejó {$sinPerfil} cuenta(s) municipal(es) sin perfil. No se aplicó un valor arbitrario.",
            );
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('perfil_municipal', 'users')) {
            $this->forge->dropColumn('users', 'perfil_municipal');
        }
    }
}
