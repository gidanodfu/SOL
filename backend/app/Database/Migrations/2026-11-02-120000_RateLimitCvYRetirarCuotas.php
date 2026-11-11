<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Retira la cuota mensual de CV y la sustituye por contadores de rate limiting.
 *
 * - `cv_cuotas_mensuales` deja de utilizarse, pero no se elimina: se renombra a
 *   `cv_cuotas_mensuales_legado` para conservar el histórico mientras se valida
 *   en producción. La migración histórica no se modifica.
 * - `rate_limit_contadores` guarda contadores por ventana fija y clave
 *   (usuario/IP). La clave primaria compuesta (clave, ventana_inicio) permite
 *   un UPSERT atómico sin dispersar el estado en varios procesos.
 *
 * `down()` restaura el nombre original y elimina los contadores. No restaura
 * consumos borrados porque la tabla histórica se conserva intacta.
 */
class RateLimitCvYRetirarCuotas extends Migration
{
    private const TABLA_CUOTAS = 'cv_cuotas_mensuales';

    private const TABLA_LEGADO = 'cv_cuotas_mensuales_legado';

    private const TABLA_RATE_LIMIT = 'rate_limit_contadores';

    public function up(): void
    {
        if ($this->db->tableExists(self::TABLA_CUOTAS)
            && ! $this->db->tableExists(self::TABLA_LEGADO)) {
            $this->db->query(
                'RENAME TABLE ' . $this->db->escapeIdentifiers(self::TABLA_CUOTAS)
                . ' TO ' . $this->db->escapeIdentifiers(self::TABLA_LEGADO),
            );
        }

        if (! $this->db->tableExists(self::TABLA_RATE_LIMIT)) {
            $this->forge->addField([
                'clave'          => ['type' => 'VARCHAR', 'constraint' => 191],
                'ventana_inicio' => ['type' => 'DATETIME'],
                'usos'           => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'default' => 0],
                'created_at'     => ['type' => 'DATETIME', 'null' => true],
                'updated_at'     => ['type' => 'DATETIME', 'null' => true],
            ]);
            // Clave primaria compuesta: el UPSERT incrementa exactamente la
            // ventana vigente y la fila actúa como punto de serialización.
            $this->forge->addKey(['clave', 'ventana_inicio'], true);
            $this->forge->addKey('ventana_inicio', false, false, 'idx_rate_limit_ventana');
            $this->forge->createTable(self::TABLA_RATE_LIMIT, true);
        }
    }

    public function down(): void
    {
        if ($this->db->tableExists(self::TABLA_RATE_LIMIT)) {
            $this->forge->dropTable(self::TABLA_RATE_LIMIT, true);
        }

        // Consulta directa a information_schema: tableExists() puede conservar
        // el estado anterior al RENAME realizado por up().
        $existe = function (string $tabla): bool {
            return $this->db->query(
                'SELECT 1 FROM information_schema.tables '
                . 'WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$tabla],
            )->getRow() !== null;
        };

        // Si cv_activos sigue existiendo, la migración anterior no se revierte:
        // se restaura el nombre original. Si no existe, ambas se revierten
        // juntas y la tabla histórica debe eliminarse.
        if ($existe('cv_activos')) {
            if ($existe(self::TABLA_LEGADO) && ! $existe(self::TABLA_CUOTAS)) {
                $this->db->query(
                    'RENAME TABLE ' . $this->db->escapeIdentifiers(self::TABLA_LEGADO)
                    . ' TO ' . $this->db->escapeIdentifiers(self::TABLA_CUOTAS),
                );
            }
        } else {
            $this->db->query(
                'DROP TABLE IF EXISTS '
                . $this->db->escapeIdentifiers(self::TABLA_CUOTAS) . ', '
                . $this->db->escapeIdentifiers(self::TABLA_LEGADO),
            );
        }
    }
}
