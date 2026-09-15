<?php

namespace App\Models;

use CodeIgniter\Model;

/**
 * Tokens de un solo uso para la activación de cuenta (enlace con vencimiento).
 * Solo se guarda el hash (SHA-256) del token; `usado=1` invalida el token
 * (tanto al consumirlo como al regenerar un enlace nuevo).
 */
class ActivacionModel extends Model
{
    protected $table         = 'activaciones';
    protected $primaryKey    = 'id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;

    protected $allowedFields = ['user_id', 'token_hash', 'tipo', 'usado', 'expira_en'];

    protected $beforeInsert = ['fijarFecha'];

    protected function fijarFecha(array $datos): array
    {
        $datos['data']['created_at'] = date('Y-m-d H:i:s');

        return $datos;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function vigente(string $tokenHash, string $tipo): ?array
    {
        return $this->where('token_hash', $tokenHash)
            ->where('tipo', $tipo)
            ->where('usado', 0)
            ->where('expira_en >', date('Y-m-d H:i:s'))
            ->first();
    }

    /**
     * Invalida todos los tokens previos del usuario (se regenera un enlace).
     */
    public function revocarDeUsuario(int $userId): void
    {
        $this->where('user_id', $userId)->where('usado', 0)->set('usado', 1)->update();
    }
}
