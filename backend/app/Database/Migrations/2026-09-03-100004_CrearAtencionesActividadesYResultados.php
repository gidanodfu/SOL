<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Atenciones, actividades (ferias/talleres/capacitaciones), oportunidades de difusión
 * y contrataciones (RF-41..RF-60). Respaldan la matriz de cumplimiento de la Resolución.
 */
class CrearAtencionesActividadesYResultados extends Migration
{
    public function up(): void
    {
        // Atención y orientación laboral (RF-41..RF-43). Tipos de la RF-42.
        $this->forge->addField([
            'id'                    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            // Cuando el ciudadano aún no está registrado como postulante.
            'persona_nombre'        => ['type' => 'VARCHAR', 'constraint' => 200, 'null' => true],
            'tipo'                  => ['type' => 'ENUM', 'constraint' => ['orientacion_laboral', 'asesoria_cv', 'preparacion_entrevista', 'orientacion_vocacional', 'formacion_empleo', 'emprendimiento', 'autoempleo', 'derivacion_trabajo_social']],
            'atendido_por'          => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'fecha'                 => ['type' => 'DATETIME'],
            'descripcion'           => ['type' => 'TEXT', 'null' => true],
            'resultado'             => ['type' => 'TEXT', 'null' => true],
            'requiere_seguimiento'  => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'fecha_seguimiento'     => ['type' => 'DATE', 'null' => true],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
            'updated_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['tipo', 'fecha']);
        $this->forge->addKey(['postulante_id', 'fecha']);
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'SET NULL', 'SET NULL');
        $this->forge->addForeignKey('atendido_por', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('atenciones', true);

        // Ferias, eventos, talleres y capacitaciones unificados por tipo (RF-44..RF-47).
        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'tipo'          => ['type' => 'ENUM', 'constraint' => ['feria_empleo', 'evento', 'taller', 'capacitacion']],
            'nombre'        => ['type' => 'VARCHAR', 'constraint' => 200],
            'descripcion'   => ['type' => 'TEXT', 'null' => true],
            'fecha_inicio'  => ['type' => 'DATETIME'],
            'fecha_fin'     => ['type' => 'DATETIME', 'null' => true],
            'lugar'         => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'modalidad'     => ['type' => 'ENUM', 'constraint' => ['presencial', 'virtual', 'mixta'], 'null' => true],
            'organizador'   => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'estado'        => ['type' => 'ENUM', 'constraint' => ['programado', 'en_curso', 'finalizado', 'cancelado'], 'default' => 'programado'],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['tipo', 'fecha_inicio']);
        $this->forge->createTable('actividades', true);

        // Difusión de oportunidades externas (RF-48..RF-51): Empleos Perú y MYPE locales.
        $this->forge->addField([
            'id'              => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'fuente'          => ['type' => 'ENUM', 'constraint' => ['empleos_peru', 'mype_local', 'otro']],
            'empresa_id'      => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'titulo'          => ['type' => 'VARCHAR', 'constraint' => 200],
            'descripcion'     => ['type' => 'TEXT', 'null' => true],
            'enlace'          => ['type' => 'VARCHAR', 'constraint' => 300, 'null' => true],
            'fecha_publicacion' => ['type' => 'DATE', 'null' => true],
            'activo'          => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['fuente', 'activo']);
        $this->forge->addForeignKey('empresa_id', 'empresas', 'id', 'SET NULL', 'SET NULL');
        $this->forge->createTable('oportunidades', true);

        // Contrataciones resultado del proceso de intermediación (RF-58).
        $this->forge->addField([
            'id'              => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulacion_id'  => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'empresa_id'      => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'oferta_id'       => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'postulante_id'   => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'fecha_contratacion' => ['type' => 'DATE'],
            'cargo'           => ['type' => 'VARCHAR', 'constraint' => 150],
            'modalidad'       => ['type' => 'VARCHAR', 'constraint' => 60, 'null' => true],
            'remuneracion'    => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'observaciones'   => ['type' => 'TEXT', 'null' => true],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('postulacion_id', false, true);
        $this->forge->addKey(['empresa_id', 'fecha_contratacion']);
        $this->forge->addForeignKey('postulacion_id', 'postulaciones', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('empresa_id', 'empresas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('oferta_id', 'ofertas', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('contrataciones', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('contrataciones', true);
        $this->forge->dropTable('oportunidades', true);
        $this->forge->dropTable('actividades', true);
        $this->forge->dropTable('atenciones', true);
    }
}
