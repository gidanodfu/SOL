<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class CategoriaModel extends Model
{
    protected $table      = 'categorias';
    protected $primaryKey = 'id';

    protected $allowedFields = ['nombre', 'activo'];

    protected $returnType = 'array';

    public function activas(): array
    {
        return $this->where('activo', 1)->orderBy('nombre')->findAll();
    }
}
