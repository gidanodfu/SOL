<?php

// SPDX-License-Identifier: MIT

namespace App\Entities;

use CodeIgniter\Entity\Entity;

/**
 * Versión de un CV: metadatos en MySQL y archivo en almacenamiento externo (RT-CV-02).
 */
class Cv extends Entity
{
    protected $dates = ['created_at', 'updated_at'];

    protected $casts = [
        'id'              => 'integer',
        'postulante_id'   => 'integer',
        'object_key'      => 'string',
        'nombre_original' => 'string',
        'mime'            => 'string',
        'tamano'          => 'integer',
        'version'         => 'integer',
        'activo'          => 'boolean',
    ];
}
