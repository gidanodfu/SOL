<?php

namespace App\Entities;

use CodeIgniter\Entity\Entity;

/**
 * Postulante (ciudadano que busca oportunidades laborales, RF-18).
 */
class Postulante extends Entity
{
    protected $dates = ['created_at', 'updated_at', 'fecha_nacimiento'];

    protected $casts = [
        'id'        => 'integer',
        'user_id'   => 'integer',
        'dni'       => 'string',
        'nombres'   => 'string',
        'apellidos' => 'string',
        'direccion' => '?string',
        'distrito'  => '?string',
        'telefono'  => '?string',
    ];
}
