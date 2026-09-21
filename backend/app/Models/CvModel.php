<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use App\Entities\Cv;
use CodeIgniter\Model;

class CvModel extends Model
{
    protected $table         = 'cvs';
    protected $primaryKey    = 'id';
    protected $returnType    = Cv::class;
    protected $useTimestamps = true;

    protected $allowedFields = [
        'postulante_id', 'object_key', 'nombre_original', 'mime', 'tamano', 'version', 'activo',
    ];

    public function activoDePostulante(int $postulanteId): ?Cv
    {
        return $this->where('postulante_id', $postulanteId)
            ->where('activo', 1)
            ->first();
    }

    public function historialDePostulante(int $postulanteId): array
    {
        return $this->where('postulante_id', $postulanteId)
            ->orderBy('version', 'DESC')
            ->findAll();
    }

    public function siguienteVersion(int $postulanteId): int
    {
        $max = $this->where('postulante_id', $postulanteId)->selectMax('version')->first();

        return ($max->version ?? 0) + 1;
    }

    /**
     * CV subidos por el postulante en el mes calendario actual (límite mensual).
     */
    public function contarDelMes(int $postulanteId): int
    {
        return $this->where('postulante_id', $postulanteId)
            ->where('created_at >=', date('Y-m-01 00:00:00'))
            ->countAllResults();
    }
}
