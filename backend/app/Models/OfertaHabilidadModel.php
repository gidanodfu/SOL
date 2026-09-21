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
}
