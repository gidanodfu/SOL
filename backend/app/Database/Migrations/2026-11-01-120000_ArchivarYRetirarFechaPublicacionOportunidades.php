<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * fecha_publicacion deja de ser un campo operativo de las oportunidades.
 *
 * La ventana de disponibilidad queda definida por fecha_inicio y fecha_fin.
 * Para no descartar valores históricos, se archivan en
 * `oportunidades_fecha_publicacion_legado` antes de retirar la columna. La
 * tabla legado permite reconstruir el valor en un rollback y conserva la
 * evidencia para auditoría.
 */
class ArchivarYRetirarFechaPublicacionOportunidades extends Migration
{
    private const TABLA = 'oportunidades';

    private const ARCHIVO = 'oportunidades_fecha_publicacion_legado';

    private const INDICE_PUBLICACION = 'oportunidades_activo_publicacion';

    public function up(): void
    {
        if (! $this->db->tableExists(self::ARCHIVO)) {
            $this->forge->addField([
                'oportunidad_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true],
                'fecha_publicacion' => ['type' => 'DATE'],
                'creado_oportunidad' => ['type' => 'DATETIME', 'null' => true],
                'archivado_at' => ['type' => 'DATETIME'],
            ]);
            $this->forge->addKey('oportunidad_id', true);
            $this->forge->createTable(self::ARCHIVO, true);
        }

        if (! $this->db->fieldExists('fecha_publicacion', self::TABLA)) {
            return;
        }

        // Preserva cada valor editorial existente con su fecha de creación.
        $this->db->query(
            'INSERT IGNORE INTO ' . $this->db->escapeIdentifiers(self::ARCHIVO)
            . ' (oportunidad_id, fecha_publicacion, creado_oportunidad, archivado_at) '
            . 'SELECT id, fecha_publicacion, created_at, NOW() FROM '
            . $this->db->escapeIdentifiers(self::TABLA)
            . ' WHERE fecha_publicacion IS NOT NULL',
        );

        if ($this->indiceExiste(self::INDICE_PUBLICACION)) {
            $this->forge->dropKey(self::TABLA, self::INDICE_PUBLICACION, false);
        }

        $this->forge->dropColumn(self::TABLA, 'fecha_publicacion');
    }

    public function down(): void
    {
        if (! $this->db->fieldExists('fecha_publicacion', self::TABLA)) {
            $this->forge->addColumn(self::TABLA, [
                'fecha_publicacion' => [
                    'type'  => 'DATE',
                    'null'  => true,
                    'after' => 'enlace',
                ],
            ]);
        }

        if ($this->db->tableExists(self::ARCHIVO)) {
            $this->db->query(
                'UPDATE ' . $this->db->escapeIdentifiers(self::TABLA) . ' o '
                . 'JOIN ' . $this->db->escapeIdentifiers(self::ARCHIVO) . ' a '
                . 'ON a.oportunidad_id = o.id '
                . 'SET o.fecha_publicacion = a.fecha_publicacion',
            );
            $this->forge->dropTable(self::ARCHIVO, true);
        }

        if (! $this->indiceExiste(self::INDICE_PUBLICACION)) {
            $this->forge->addKey(
                ['activo', 'fecha_publicacion'],
                false,
                false,
                self::INDICE_PUBLICACION,
            );
            $this->forge->processIndexes(self::TABLA);
        }
    }

    private function indiceExiste(string $nombre): bool
    {
        foreach ($this->db->getIndexData(self::TABLA) as $indice) {
            if (($indice->name ?? '') === $nombre) {
                return true;
            }
        }

        return false;
    }
}
