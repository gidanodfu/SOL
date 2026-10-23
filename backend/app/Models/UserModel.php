<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use App\Entities\Usuario;
use CodeIgniter\Model;

class UserModel extends Model
{
    protected $table         = 'users';
    protected $primaryKey    = 'id';
    protected $returnType    = Usuario::class;
    protected $useTimestamps = true;

    protected $allowedFields = [
        'username', 'password_hash', 'rol', 'proveedor', 'proveedor_id',
        'nombres', 'apellidos', 'email', 'telefono', 'estado', 'ultimo_acceso',
        'terms_accepted_at', 'terms_version',
    ];

    public function buscarPorUsername(string $username): ?Usuario
    {
        return $this->where('username', $username)->first();
    }
}
