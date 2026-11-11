<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Garantías de integridad para CV:
 *
 * - `cv_cuotas_mensuales` persiste el consumo por postulante y periodo
 *   (AAAA-MM) con clave única; el servicio incrementa de forma atómica y
 *   bloquea la fila antes de comprobar el límite de cuatro.
 * - `cv_activos` mantiene una fila por postulante con el CV vigente y una
 *   restricción única sobre `cv_id`: solo puede existir un CV activo.
 *
 * La migración conserva todas las versiones históricas. Si encuentra más de un
 * CV activo por postulante, deja activo el más reciente y desactiva los demás;
 * no elimina archivos ni filas.
 */
class CuotasCvYActivoUnico extends Migration
{
    private const TABLA_CUOTAS = 'cv_cuotas_mensuales';

    public function up(): void
    {
        if (! $this->db->tableExists(self::TABLA_CUOTAS)) {
            $this->forge->addField([
                'id'            => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
                'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
                'periodo'       => ['type' => 'CHAR', 'constraint' => 7],
                'usos'          => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0],
                'created_at'    => ['type' => 'DATETIME', 'null' => true],
                'updated_at'    => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['postulante_id', 'periodo'], false, true, 'uq_cv_cuota_postulante_periodo');
            $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
            $this->forge->createTable(self::TABLA_CUOTAS, true);
        }

        // Backfill: cada CV histórico cuenta como una carga del mes en que se
        // creó. No se borran cuotas ni versiones históricas.
        $cuotas = (int) $this->db->table(self::TABLA_CUOTAS)->countAllResults();
        if ($cuotas === 0) {
            $this->db->query(
                'INSERT INTO ' . $this->db->escapeIdentifiers(self::TABLA_CUOTAS)
                . ' (postulante_id, periodo, usos, created_at, updated_at) '
                . "SELECT postulante_id, DATE_FORMAT(COALESCE(created_at, updated_at, NOW()), '%Y-%m'), COUNT(*), NOW(), NOW() "
                . 'FROM ' . $this->db->escapeIdentifiers('cvs')
                . ' GROUP BY postulante_id, DATE_FORMAT(COALESCE(created_at, updated_at, NOW()), \'%Y-%m\')',
            );
        }

        if (! $this->db->tableExists('cv_activos')) {
            $this->forge->addField([
                'postulante_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
                'cv_id'         => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
                'created_at'    => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('postulante_id', true);
            $this->forge->addKey('cv_id', false, true, 'uq_cv_activo_cv');
            $this->forge->addForeignKey('postulante_id', 'postulantes', 'id', 'CASCADE', 'CASCADE');
            $this->forge->addForeignKey('cv_id', 'cvs', 'id', 'CASCADE', 'CASCADE');
            $this->forge->createTable('cv_activos', true);
        }

        // Normaliza duplicados históricos sin borrar filas: conserva el CV
        // activo más reciente y desactiva los anteriores.
        $this->db->query(
            'UPDATE ' . $this->db->escapeIdentifiers('cvs') . ' c '
            . 'JOIN ('
            . 'SELECT postulante_id, MAX(id) AS keep_id '
            . 'FROM ' . $this->db->escapeIdentifiers('cvs')
            . ' WHERE activo = 1 GROUP BY postulante_id HAVING COUNT(*) > 1'
            . ') d ON d.postulante_id = c.postulante_id '
            . 'SET c.activo = 0 '
            . 'WHERE c.activo = 1 AND c.id <> d.keep_id',
        );

        // Backfill del CV activo. INSERT IGNORE es seguro si la migración se
        // reintenta después de una interrupción.
        $this->db->query(
            'INSERT IGNORE INTO ' . $this->db->escapeIdentifiers('cv_activos')
            . ' (postulante_id, cv_id, created_at) '
            . 'SELECT c.postulante_id, c.id, NOW() '
            . 'FROM ' . $this->db->escapeIdentifiers('cvs') . ' c '
            . 'JOIN ('
            . 'SELECT postulante_id, MAX(id) AS keep_id '
            . 'FROM ' . $this->db->escapeIdentifiers('cvs')
            . ' WHERE activo = 1 GROUP BY postulante_id'
            . ') d ON d.keep_id = c.id',
        );
    }

    public function down(): void
    {
        // DROP directo: tableExists() cachea el estado anterior al RENAME de
        // RateLimitCvYRetirarCuotas y puede dejar la tabla con el nombre nuevo.
        // Ambas tablas y cv_activos pertenecen a esta migración.
        $this->db->query(
            'DROP TABLE IF EXISTS '
            . $this->db->escapeIdentifiers('cv_activos') . ', '
            . $this->db->escapeIdentifiers(self::TABLA_CUOTAS) . ', '
            . $this->db->escapeIdentifiers(self::TABLA_CUOTAS . '_legado'),
        );
    }
}
