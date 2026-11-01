<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class OportunidadModel extends Model
{
    protected $table         = 'oportunidades';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = true;

    protected $allowedFields = [
        'fuente', 'titulo', 'descripcion', 'enlace', 'fecha_inicio', 'fecha_fin',
        'modalidad', 'estado', 'activo',
    ];
}
