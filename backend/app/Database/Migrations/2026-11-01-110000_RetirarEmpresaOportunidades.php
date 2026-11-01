<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;
use RuntimeException;

/**
 * Retira la relación oportunidad → empresa.
 *
 * Una oportunidad de difusión externa (Empleos Perú, MYPE local u otra fuente)
 * no tiene un flujo municipal que asigne una empresa registrada: el formulario
 * nunca ofreció selector, no existe endpoint de asignación y la relación solo
 * se usaba para un LEFT JOIN de presentación. La decisión es eliminar la
 * relación, no inventar una UI para justificarla.
 *
 * Seguridad: si en el entorno destino existe al menos un empresa_id no nulo,
 * la migración aborta y no destruye datos. En ese caso se debe revisar la
 * procedencia y aprobar un plan de preservación antes de reintentar.
 */
class RetirarEmpresaOportunidades extends Migration
{
    private const TABLA = 'oportunidades';

    public function up(): void
    {
        if (! $this->db->fieldExists('empresa_id', self::TABLA)) {
            return;
        }

        $conEmpresa = $this->db->table(self::TABLA)
            ->where('empresa_id IS NOT NULL', null, false)
            ->countAllResults();

        if ($conEmpresa > 0) {
            throw new RuntimeException(
                "No se retira empresa_id: existen {$conEmpresa} oportunidad(es) con empresa asociada. "
                . 'Revise su procedencia y apruebe un plan de preservación antes de ejecutar esta migración.',
            );
        }

        $fk = $this->claveForaneaEmpresa();
        if ($fk !== null) {
            $this->forge->dropForeignKey(self::TABLA, $fk);
        }

        foreach ($this->clavesDeEmpresa() as $clave) {
            if ($clave !== 'PRIMARY') {
                $this->forge->dropKey(self::TABLA, $clave, false);
            }
        }

        $this->forge->dropColumn(self::TABLA, 'empresa_id');
    }

    public function down(): void
    {
        if ($this->db->fieldExists('empresa_id', self::TABLA)) {
            return;
        }

        $this->forge->addColumn(self::TABLA, [
            'empresa_id' => [
                'type'       => 'INT',
                'constraint' => 10,
                'unsigned'   => true,
                'null'       => true,
                'after'      => 'fuente',
            ],
        ]);

        $this->forge->addKey('empresa_id', false, false, 'oportunidades_empresa_id_foreign');
        $this->forge->processIndexes(self::TABLA);

        $this->forge->addForeignKey(
            'empresa_id',
            'empresas',
            'id',
            'SET NULL',
            'SET NULL',
            'oportunidades_empresa_id_foreign',
        );
        $this->forge->processIndexes(self::TABLA);
    }

    private function claveForaneaEmpresa(): ?string
    {
        $fila = $this->db->query(
            'SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE '
            . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? '
            . 'AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ?',
            [self::TABLA, 'empresa_id', 'empresas'],
        )->getRowArray();

        return $fila['CONSTRAINT_NAME'] ?? null;
    }

    /**
     * @return list<string>
     */
    private function clavesDeEmpresa(): array
    {
        $filas = $this->db->query(
            "SHOW INDEX FROM `" . self::TABLA . "` WHERE Column_name = 'empresa_id'",
        )->getResultArray();

        return array_values(array_unique(array_column($filas, 'Key_name')));
    }
}
