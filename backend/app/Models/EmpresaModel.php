<?php

namespace App\Models;

use App\Entities\Empresa;
use CodeIgniter\Model;

class EmpresaModel extends Model
{
    protected $table         = 'empresas';
    protected $primaryKey    = 'id';
    protected $returnType    = Empresa::class;
    protected $useTimestamps = true;

    protected $allowedFields = [
        'user_id', 'ruc', 'razon_social', 'nombre_comercial', 'direccion',
        'telefono', 'email', 'representante', 'info_adicional',
        'evaluacion_presencial', 'estado',
    ];
}
