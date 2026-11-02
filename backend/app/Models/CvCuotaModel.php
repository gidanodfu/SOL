<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

/**
 * Contador mensual persistido de CV subidos por postulante. La clave única
 * (postulante_id, periodo) es la garantía de concurrencia; el servicio además
 * usa SELECT ... FOR UPDATE antes de incrementar.
 */
class CvCuotaModel extends Model
{
    protected $table         = 'cv_cuotas_mensuales';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = true;

    protected $allowedFields = ['postulante_id', 'periodo', 'usos'];

    public function usos(int $postulanteId, string $periodo): int
    {
        $fila = $this->where('postulante_id', $postulanteId)
            ->where('periodo', $periodo)
            ->first();

        return (int) ($fila['usos'] ?? 0);
    }
}
