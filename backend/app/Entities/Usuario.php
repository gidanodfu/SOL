<?php

namespace App\Entities;

use CodeIgniter\Entity\Entity;

/**
 * Usuario del sistema. El rol proviene siempre de la base de datos (RF-04/RN-07)
 * y no es modificable desde el frontend.
 */
class Usuario extends Entity
{
    protected $datamap = [];

    protected $dates = ['created_at', 'updated_at', 'ultimo_acceso'];

    protected $casts = [
        'id'        => 'integer',
        'username'  => 'string',
        'rol'       => 'string',
        'nombres'   => 'string',
        'apellidos' => 'string',
        'email'     => '?string',
        'telefono'  => '?string',
        'estado'    => 'string',
    ];

    protected $hidden = ['password_hash'];

    public function nombreCompleto(): string
    {
        return trim(($this->nombres ?? '') . ' ' . ($this->apellidos ?? ''));
    }
}
