<?php

namespace App\Models;

use App\Entities\Oferta;
use CodeIgniter\Model;

class OfertaModel extends Model
{
    protected $table         = 'ofertas';
    protected $primaryKey    = 'id';
    protected $returnType    = Oferta::class;
    protected $useTimestamps = true;

    protected $allowedFields = [
        'empresa_id', 'categoria_id', 'puesto', 'descripcion', 'funciones', 'requisitos',
        'formacion_requerida', 'experiencia_requerida', 'tipo_empleo', 'ubicacion',
        'remuneracion', 'vacantes', 'fecha_publicacion', 'fecha_cierre', 'estado',
        'motivo_rechazo', 'validado_por', 'fecha_validacion',
    ];
}
