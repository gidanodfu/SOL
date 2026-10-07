<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Ampliación de empleabilidad (RF-19/RF-36/RF-58 + imágenes de empresa):
 * - Retira los estados de postulación "preseleccionado" y "contactado".
 *   Transformación de datos existentes: ambos se colapsan a "en_revision"
 *   (último estado intermedio antes de la selección), tanto en `postulaciones`
 *   como en `postulacion_historial`. No se elimina ningún registro.
 * - Perfil laboral del postulante: ocupación, experiencia y estudios.
 * - Situación laboral posterior de una contratación (máximo 4 estados).
 * - Imágenes de empresa: logo y flyer (metadatos; el binario va en Storage).
 *
 * La transformación de estados NO es reversible (no se puede saber si un
 * "en_revision" provino de "preseleccionado" o "contactado"); down() restaura
 * la estructura, no los datos.
 */
class AmpliarEmpleabilidad extends Migration
{
    public function up(): void
    {
        // 1. Retirar estados: primero transformar datos, luego el ENUM.
        $this->db->query("UPDATE postulaciones SET estado = 'en_revision' WHERE estado IN ('preseleccionado', 'contactado')");
        $this->db->query("UPDATE postulacion_historial SET estado_nuevo = 'en_revision' WHERE estado_nuevo IN ('preseleccionado', 'contactado')");
        $this->db->query("UPDATE postulacion_historial SET estado_anterior = 'en_revision' WHERE estado_anterior IN ('preseleccionado', 'contactado')");
        $this->db->query("ALTER TABLE postulaciones MODIFY COLUMN estado ENUM('pendiente','en_revision','seleccionado','no_seleccionado') NOT NULL DEFAULT 'pendiente'");

        // 2. Perfil laboral del postulante (RF-19).
        $this->forge->addColumn('postulantes', [
            'ocupacion'   => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true, 'after' => 'distrito'],
            'experiencia' => ['type' => 'TEXT', 'null' => true, 'after' => 'ocupacion'],
            'estudios'    => ['type' => 'TEXT', 'null' => true, 'after' => 'experiencia'],
        ]);

        // 3. Situación laboral de la contratación (RF-58). Máximo 4 estados.
        $this->forge->addColumn('contrataciones', [
            'situacion_laboral' => ['type' => 'ENUM', 'constraint' => ['contratado', 'finalizado', 'despedido', 'renuncio'], 'default' => 'contratado', 'after' => 'modalidad'],
            'motivo_situacion'  => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'situacion_laboral'],
            'fecha_situacion'   => ['type' => 'DATE', 'null' => true, 'after' => 'motivo_situacion'],
        ]);

        // 4. Imágenes de empresa (logo y flyer). Metadatos; binario en Storage.
        $this->forge->addColumn('empresas', [
            'logo_key'   => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'info_adicional'],
            'imagen_key' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'after' => 'logo_key'],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('empresas', ['logo_key', 'imagen_key']);
        $this->forge->dropColumn('contrataciones', ['situacion_laboral', 'motivo_situacion', 'fecha_situacion']);
        $this->forge->dropColumn('postulantes', ['ocupacion', 'experiencia', 'estudios']);

        $this->db->query("ALTER TABLE postulaciones MODIFY COLUMN estado ENUM('pendiente','en_revision','preseleccionado','contactado','seleccionado','no_seleccionado') NOT NULL DEFAULT 'pendiente'");
    }
}
