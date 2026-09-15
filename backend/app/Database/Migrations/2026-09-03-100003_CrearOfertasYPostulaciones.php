<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Ofertas y postulaciones (RF-22..RF-40, RN-13..RN-19).
 * Ciclo de vida de ofertas: borrador → pendiente → publicada/cerrada/rechazada (RF-23/24).
 * RN-14 (una postulación activa por oferta) se fuerza con columna generada única.
 */
class CrearOfertasYPostulaciones extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'     => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'nombre' => ['type' => 'VARCHAR', 'constraint' => 100],
            'activo' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('nombre', false, true);
        $this->forge->createTable('categorias', true);

        $this->forge->addField([
            'id'                    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'empresa_id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'categoria_id'          => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'puesto'                => ['type' => 'VARCHAR', 'constraint' => 150],
            'descripcion'           => ['type' => 'TEXT', 'null' => true],
            'funciones'             => ['type' => 'TEXT', 'null' => true],
            'requisitos'            => ['type' => 'TEXT', 'null' => true],
            'formacion_requerida'   => ['type' => 'VARCHAR', 'constraint' => 200, 'null' => true],
            'experiencia_requerida' => ['type' => 'VARCHAR', 'constraint' => 200, 'null' => true],
            'tipo_empleo'           => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'ubicacion'             => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'remuneracion'          => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'vacantes'              => ['type' => 'INT', 'constraint' => 5, 'unsigned' => true, 'default' => 1],
            'fecha_publicacion'     => ['type' => 'DATE', 'null' => true],
            'fecha_cierre'          => ['type' => 'DATE', 'null' => true],
            'estado'                => ['type' => 'ENUM', 'constraint' => ['borrador', 'pendiente', 'publicada', 'cerrada', 'rechazada'], 'default' => 'borrador'],
            'motivo_rechazo'        => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'validado_por'          => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'fecha_validacion'      => ['type' => 'DATETIME', 'null' => true],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
            'updated_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['empresa_id', 'estado']);
        $this->forge->addKey(['estado', 'created_at']);
        $this->forge->addForeignKey('empresa_id', 'empresas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('categoria_id', 'categorias', 'id', 'SET NULL', 'SET NULL');
        $this->forge->addForeignKey('validado_por', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('ofertas', true);

        $this->forge->addField([
            'id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'oferta_id'  => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'habilidad'  => ['type' => 'VARCHAR', 'constraint' => 100],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['oferta_id', 'habilidad'], false, true);
        $this->forge->addForeignKey('oferta_id', 'ofertas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ofertas_habilidades', true);

        $this->forge->addField([
            'id'              => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id'   => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'oferta_id'       => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            // Desnormalizado para la bandeja de la empresa (RF-33); RUC/oficina no importa.
            'empresa_id'      => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'fecha_postulacion' => ['type' => 'DATETIME'],
            // Estados de la RF-36. Historial de cambios en postulacion_historial (RF-39).
            'estado'          => ['type' => 'ENUM', 'constraint' => ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'], 'default' => 'pendiente'],
            // activo=0 = desactivada; nunca se elimina físicamente (RF-38/RN-17).
            'activo'          => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['empresa_id', 'estado', 'fecha_postulacion']);
        $this->forge->addKey(['postulante_id', 'activo']);
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('oferta_id', 'ofertas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('empresa_id', 'empresas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('postulaciones', true);

        // RN-14: una única postulación ACTIVA por (postulante, oferta).
        // La columna generada vale NULL cuando está inactiva, permitiendo reactivar o
        // crear nuevas postulaciones desactivadas sin colisionar. VIRTUAL (no STORED):
        // en MySQL 8 un generated STORED sobre tablas con FK dispara error 1215.
        $this->db->query(
            'ALTER TABLE postulaciones
             ADD COLUMN postulacion_unica VARCHAR(50)
             GENERATED ALWAYS AS (IF(activo = 1, CONCAT(postulante_id, \'-\', oferta_id), NULL)) VIRTUAL'
        );
        $this->db->query('ALTER TABLE postulaciones ADD UNIQUE KEY uq_postulacion_activa (postulacion_unica)');

        // Historial de estados de cada postulación (RF-39/RF-63). Fecha de "contactado"
        // se deriva aquí para el indicador de tiempo de atención (RF-59).
        $this->forge->addField([
            'id'               => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulacion_id'   => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'estado_anterior'  => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'estado_nuevo'     => ['type' => 'VARCHAR', 'constraint' => 30],
            'usuario_id'       => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['postulacion_id', 'created_at']);
        $this->forge->addForeignKey('postulacion_id', 'postulaciones', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('usuario_id', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('postulacion_historial', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('postulacion_historial', true);
        $this->forge->dropTable('postulaciones', true);
        $this->forge->dropTable('ofertas_habilidades', true);
        $this->forge->dropTable('ofertas', true);
        $this->forge->dropTable('categorias', true);
    }
}
