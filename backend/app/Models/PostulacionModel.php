<?php

namespace App\Models;

use CodeIgniter\Model;

class PostulacionModel extends Model
{
    protected $table      = 'postulaciones';
    protected $primaryKey = 'id';

    protected $allowedFields = [
        'postulante_id', 'oferta_id', 'empresa_id', 'fecha_postulacion', 'estado', 'activo',
    ];

    protected $useTimestamps = true;

    protected $returnType = 'array';
}
