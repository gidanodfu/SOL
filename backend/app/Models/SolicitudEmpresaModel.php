<?php

namespace App\Models;

use CodeIgniter\Model;

/**
 * Solicitudes de registro de empresa enviadas desde el formulario público.
 * Estado: pendiente → aprobada | rechazada. Nunca se eliminan (RN-12/RN-17).
 */
class SolicitudEmpresaModel extends Model
{
    protected $table         = 'solicitudes_empresa';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = true;

    protected $allowedFields = [
        'ruc', 'razon_social', 'nombre_comercial', 'direccion', 'email',
        'telefono', 'representante', 'estado', 'motivo_rechazo',
        'resuelto_por', 'resuelto_en',
    ];
}
