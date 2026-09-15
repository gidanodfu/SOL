<?php

namespace App\Models;

use CodeIgniter\Model;

class ActividadModel extends Model
{
    protected $table         = 'actividades';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = true;

    protected $allowedFields = [
        'tipo', 'nombre', 'descripcion', 'fecha_inicio', 'fecha_fin',
        'lugar', 'modalidad', 'organizador', 'estado',
    ];
}
