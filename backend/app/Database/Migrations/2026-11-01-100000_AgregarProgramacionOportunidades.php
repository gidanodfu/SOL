<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Programación y ciclo de vida de las oportunidades de difusión (RF-48..RF-51).
 *
 * `fecha_publicacion` sigue siendo la fecha editorial de liberación al portal y
 * `activo` la ocultación administrativa. Estas columnas nuevas describen el
 * ciclo de vida (programado, en_curso, finalizado, cancelado).
 *
 * Las filas históricas pueden no tener programación: `fecha_inicio`, `fecha_fin`
 * y `modalidad` son NULL para no inventar horarios. `estado` nace en
 * `programado`, que es el valor neutro; no se convierte `activo = 0` en
 * `cancelado`.
 */
class AgregarProgramacionOportunidades extends Migration
{
    private const TABLA = 'oportunidades';

    private const INDICE_PUBLICACION = 'oportunidades_activo_publicacion';

    public function up(): void
    {
        $campos = [];

        if (! $this->db->fieldExists('fecha_inicio', self::TABLA)) {
            $campos['fecha_inicio'] = [
                'type'  => 'DATETIME',
                'null'  => true,
                'after' => 'fecha_publicacion',
            ];
        }

        if (! $this->db->fieldExists('fecha_fin', self::TABLA)) {
            $campos['fecha_fin'] = [
                'type'  => 'DATETIME',
                'null'  => true,
                'after' => 'fecha_inicio',
            ];
        }

        if (! $this->db->fieldExists('modalidad', self::TABLA)) {
            $campos['modalidad'] = [
                'type'       => 'ENUM',
                'constraint' => ['presencial', 'virtual', 'mixta'],
                'null'       => true,
                'after'      => 'fecha_fin',
            ];
        }

        if (! $this->db->fieldExists('estado', self::TABLA)) {
            $campos['estado'] = [
                'type'       => 'ENUM',
                'constraint' => ['programado', 'en_curso', 'finalizado', 'cancelado'],
                'default'    => 'programado',
                'after'      => 'modalidad',
            ];
        }

        if ($campos !== []) {
            $this->forge->addColumn(self::TABLA, $campos);
        }

        // La lectura pública filtra por activo y fecha de publicación. El
        // estado efectivo se deriva en PHP (por fecha de fin y estado manual),
        // por lo que no se crea un índice redundante para ese filtro.
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

    public function down(): void
    {
        if ($this->indiceExiste(self::INDICE_PUBLICACION)) {
            $this->forge->dropKey(self::TABLA, self::INDICE_PUBLICACION, false);
        }

        foreach (['estado', 'modalidad', 'fecha_fin', 'fecha_inicio'] as $campo) {
            if ($this->db->fieldExists($campo, self::TABLA)) {
                $this->forge->dropColumn(self::TABLA, $campo);
            }
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
