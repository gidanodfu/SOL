<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use App\Entities\Postulante;
use CodeIgniter\Model;

class PostulanteModel extends Model
{
    protected $table         = 'postulantes';
    protected $primaryKey    = 'id';
    protected $returnType    = Postulante::class;
    protected $useTimestamps = true;

    protected $allowedFields = [
        'user_id', 'dni', 'nombres', 'apellidos', 'fecha_nacimiento',
        'direccion', 'distrito', 'telefono',
    ];

    public function porUserId(int $userId): ?Postulante
    {
        return $this->where('user_id', $userId)->first();
    }
}
