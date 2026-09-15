<?php

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;

/**
 * Consultas de empresas con su usuario asociado (RF-10..RF-12).
 */
class EmpresaRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @param array{estado?: string, q?: string} $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros, int $limite = 100, int $offset = 0): array
    {
        $builder = $this->db->table('empresas')
            ->select('empresas.*, users.username, users.estado AS user_estado, users.email AS user_email')
            ->join('users', 'users.id = empresas.user_id');

        if (! empty($filtros['estado'])) {
            $builder->where('empresas.estado', $filtros['estado']);
        }
        if (! empty($filtros['q'])) {
            $builder->groupStart()
                ->like('empresas.ruc', $filtros['q'])
                ->orLike('empresas.razon_social', $filtros['q'])
                ->orLike('empresas.nombre_comercial', $filtros['q'])
                ->groupEnd();
        }

        return $builder->orderBy('empresas.created_at', 'DESC')
            ->limit($limite, $offset)
            ->get()
            ->getResultArray();
    }

    public function contar(array $filtros): int
    {
        $builder = $this->db->table('empresas');

        if (! empty($filtros['estado'])) {
            $builder->where('empresas.estado', $filtros['estado']);
        }

        return (int) $builder->countAllResults();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function obtenerConUsuario(int $empresaId): ?array
    {
        return $this->db->table('empresas')
            ->select('empresas.*, users.username, users.estado AS user_estado, users.email AS user_email')
            ->join('users', 'users.id = empresas.user_id')
            ->where('empresas.id', $empresaId)
            ->get()
            ->getRowArray() ?: null;
    }

    public function contarOfertas(int $empresaId): int
    {
        return (int) $this->db->table('ofertas')->where('empresa_id', $empresaId)->countAllResults();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function porUserId(int $userId): ?array
    {
        return $this->db->table('empresas')->where('user_id', $userId)->get()->getRowArray() ?: null;
    }
}
