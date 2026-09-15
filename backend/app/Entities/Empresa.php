<?php

namespace App\Entities;

use CodeIgniter\Entity\Entity;

/**
 * Empresa evaluada y registrada por la Municipalidad (RF-08..RF-10).
 */
class Empresa extends Entity
{
    protected $dates = ['created_at', 'updated_at'];

    protected $casts = [
        'id'                    => 'integer',
        'user_id'               => 'integer',
        'ruc'                   => 'string',
        'razon_social'          => 'string',
        'nombre_comercial'      => '?string',
        'direccion'             => '?string',
        'telefono'              => '?string',
        'email'                 => '?string',
        'representante'         => '?string',
        'info_adicional'        => '?string',
        'evaluacion_presencial' => 'boolean',
        'estado'                => 'string',
    ];
}
