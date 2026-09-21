<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class RefreshTokenModel extends Model
{
    protected $table      = 'user_refresh_tokens';
    protected $primaryKey = 'id';

    protected $allowedFields = ['user_id', 'token_hash', 'expires_at', 'revocado'];

    protected $useTimestamps = false;

    protected $beforeInsert = ['fijarFecha'];

    protected function fijarFecha(array $datos): array
    {
        $datos['data']['created_at'] = date('Y-m-d H:i:s');

        return $datos;
    }

    public function vigente(string $tokenHash): ?array
    {
        return $this->where('token_hash', $tokenHash)
            ->where('revocado', 0)
            ->where('expires_at >', date('Y-m-d H:i:s'))
            ->first();
    }

    public function revocar(string $tokenHash): void
    {
        $this->where('token_hash', $tokenHash)->set('revocado', 1)->update();
    }

    public function revocarTodos(int $userId): void
    {
        $this->where('user_id', $userId)->set('revocado', 1)->update();
    }
}
