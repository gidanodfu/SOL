<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Empresas, postulantes y perfiles laborales (RF-08..RF-21, RF-19/20, RT-CV).
 * Una empresa/empresa = un usuario; la desactivación nunca elimina (RN-12/17).
 */
class CrearEmpresasYPostulantes extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'                    => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'user_id'               => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'ruc'                   => ['type' => 'CHAR', 'constraint' => 11],
            'razon_social'          => ['type' => 'VARCHAR', 'constraint' => 200],
            'nombre_comercial'      => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'direccion'             => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'telefono'              => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'email'                 => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'representante'         => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'info_adicional'        => ['type' => 'TEXT', 'null' => true],
            // Evaluación presencial previa exigida por la Municipalidad (RF-09/RN-02).
            'evaluacion_presencial' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'estado'                => ['type' => 'ENUM', 'constraint' => ['activo', 'inactivo'], 'default' => 'inactivo'],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
            'updated_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('ruc', false, true);
        $this->forge->addKey('user_id', false, true);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('empresas', true);

        $this->forge->addField([
            'id'               => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'user_id'          => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'dni'              => ['type' => 'CHAR', 'constraint' => 8],
            'nombres'          => ['type' => 'VARCHAR', 'constraint' => 100],
            'apellidos'        => ['type' => 'VARCHAR', 'constraint' => 100],
            'fecha_nacimiento' => ['type' => 'DATE', 'null' => true],
            'direccion'        => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'distrito'         => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'telefono'         => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
            'updated_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('dni', false, true);
        $this->forge->addKey('user_id', false, true);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('postulantes', true);

        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'nivel'         => ['type' => 'VARCHAR', 'constraint' => 50],
            'institucion'   => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'titulo'        => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'fecha_inicio'  => ['type' => 'DATE', 'null' => true],
            'fecha_fin'     => ['type' => 'DATE', 'null' => true],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('postulante_id');
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('formacion_academica', true);

        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'empresa'       => ['type' => 'VARCHAR', 'constraint' => 150],
            'cargo'         => ['type' => 'VARCHAR', 'constraint' => 100],
            'funciones'     => ['type' => 'TEXT', 'null' => true],
            'fecha_inicio'  => ['type' => 'DATE', 'null' => true],
            // null = empleo actual
            'fecha_fin'     => ['type' => 'DATE', 'null' => true],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('postulante_id');
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('experiencia_laboral', true);

        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'nombre'        => ['type' => 'VARCHAR', 'constraint' => 100],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['postulante_id', 'nombre'], false, true);
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('habilidades', true);

        $this->forge->addField([
            'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'tipo'          => ['type' => 'ENUM', 'constraint' => ['curso', 'certificacion']],
            'nombre'        => ['type' => 'VARCHAR', 'constraint' => 150],
            'institucion'   => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'anio'          => ['type' => 'SMALLINT', 'null' => true],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('postulante_id');
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('cursos_certificaciones', true);

        // CV: metadatos en MySQL, archivo en Supabase Storage (RT-CV-01/02/07/08).
        $this->forge->addField([
            'id'              => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'postulante_id'   => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'object_key'      => ['type' => 'VARCHAR', 'constraint' => 255],
            'nombre_original' => ['type' => 'VARCHAR', 'constraint' => 255],
            'mime'            => ['type' => 'VARCHAR', 'constraint' => 120],
            'tamano'          => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
            'version'         => ['type' => 'INT', 'constraint' => 5, 'unsigned' => true, 'default' => 1],
            'activo'          => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['postulante_id', 'activo']);
        $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('cvs', true);
    }

    public function down(): void
    {
        $tables = ['cvs', 'cursos_certificaciones', 'habilidades', 'experiencia_laboral',
            'formacion_academica', 'postulantes', 'empresas'];
        foreach ($tables as $table) {
            $this->forge->dropTable($table, true);
        }
    }
}
