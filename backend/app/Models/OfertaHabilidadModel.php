<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class OfertaHabilidadModel extends Model
{
    protected $table      = 'ofertas_habilidades';
    protected $primaryKey = 'id';

    protected $allowedFields = ['oferta_id', 'habilidad'];

    public function reemplazar(int $ofertaId, array $habilidades): void
    {
        $this->where('oferta_id', $ofertaId)->delete();

        $filas = array_map(static fn ($h) => ['oferta_id' => $ofertaId, 'habilidad' => trim($h)], $habilidades);
        if ($filas !== []) {
            $this->insertBatch($filas);
        }
    }

    public function deOferta(int $ofertaId): array
    {
        return array_column($this->where('oferta_id', $ofertaId)->orderBy('habilidad')->findAll(), 'habilidad');
    }

    /**
     * Habilidades de varias ofertas en una sola consulta, agrupadas por id.
     * Evita N+1 en listados; las ofertas sin habilidades simplemente no
     * aparecen en el mapa.
     *
     * @param list<int> $ofertaIds
     *
     * @return array<int, list<string>>
     */
    public function deVariasOfertas(array $ofertaIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ofertaIds), static fn (int $id): bool => $id > 0)));
        if ($ids === []) {
            return [];
        }

        $filas = $this->whereIn('oferta_id', $ids)
            ->orderBy('oferta_id')
            ->orderBy('habilidad')
            ->findAll();

        $mapa = [];
        foreach ($filas as $fila) {
            $mapa[(int) $fila['oferta_id']][] = $fila['habilidad'];
        }

        return $mapa;
    }
}
