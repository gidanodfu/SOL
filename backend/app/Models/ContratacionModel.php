<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class ContratacionModel extends Model
{
    protected $table         = 'contrataciones';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;

    protected $allowedFields = [
        'postulacion_id', 'empresa_id', 'oferta_id', 'postulante_id',
        'fecha_contratacion', 'cargo', 'modalidad', 'remuneracion', 'observaciones',
    ];

    protected $beforeInsert = ['fijarFecha'];

    protected function fijarFecha(array $datos): array
    {
        $datos['data']['created_at'] = date('Y-m-d H:i:s');

        return $datos;
    }
}
