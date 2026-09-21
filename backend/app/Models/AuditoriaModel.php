<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class AuditoriaModel extends Model
{
    protected $table      = 'auditoria';
    protected $primaryKey = 'id';
    protected $allowedFields = ['user_id', 'accion', 'entidad', 'entidad_id', 'detalle', 'ip'];

    // created_at manual (sin updated_at).
    protected $useTimestamps = false;

    protected $beforeInsert = ['fijarFecha'];

    protected function fijarFecha(array $datos): array
    {
        $datos['data']['created_at'] = date('Y-m-d H:i:s');

        return $datos;
    }
}
