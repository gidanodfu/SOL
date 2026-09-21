<?php

// SPDX-License-Identifier: MIT

namespace App\Entities;

use CodeIgniter\Entity\Entity;

/**
 * Oferta laboral registrada por una empresa y validada por la Municipalidad
 * (RF-22..RF-26). Ciclo: borrador → publicada → cerrada (publicación directa por la empresa).
 */
class Oferta extends Entity
{
    protected $dates = ['created_at', 'updated_at', 'fecha_publicacion', 'fecha_cierre', 'fecha_validacion'];

    protected $casts = [
        'id'                    => 'integer',
        'empresa_id'            => 'integer',
        'categoria_id'          => '?integer',
        'puesto'                => 'string',
        'descripcion'           => '?string',
        'funciones'             => '?string',
        'requisitos'            => '?string',
        'formacion_requerida'   => '?string',
        'experiencia_requerida' => '?string',
        'tipo_empleo'           => '?string',
        'ubicacion'             => '?string',
        'remuneracion'          => '?float',
        'vacantes'              => 'integer',
        'estado'                => 'string',
        'motivo_rechazo'        => '?string',
        'validado_por'          => '?integer',
    ];
}
