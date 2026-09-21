<?php

// SPDX-License-Identifier: MIT

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;

/**
 * Consultas de solicitudes de registro de empresa con el admin que la resolvió.
 */
class SolicitudEmpresaRepository
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
        $builder = $this->base();

        if (! empty($filtros['estado'])) {
            $builder->where('s.estado', $filtros['estado']);
        }
        if (! empty($filtros['q'])) {
            $builder->groupStart()
                ->like('s.ruc', $filtros['q'])
                ->orLike('s.razon_social', $filtros['q'])
                ->orLike('s.representante', $filtros['q'])
                ->orLike('s.email', $filtros['q'])
                ->groupEnd();
        }

        return $builder->orderBy('s.created_at', 'DESC')
            ->limit($limite, $offset)
            ->get()
            ->getResultArray();
    }

    public function contar(array $filtros): int
    {
        $builder = $this->db->table('solicitudes_empresa s');

        if (! empty($filtros['estado'])) {
            $builder->where('s.estado', $filtros['estado']);
        }

        return (int) $builder->countAllResults();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function obtener(int $id): ?array
    {
        return $this->base()->where('s.id', $id)->get()->getRowArray() ?: null;
    }

    private function base(): \CodeIgniter\Database\BaseBuilder
    {
        return $this->db->table('solicitudes_empresa s')
            ->select('s.*, u.nombres AS resuelto_por_nombre, u.apellidos AS resuelto_por_apellido')
            ->join('users u', 'u.id = s.resuelto_por', 'LEFT');
    }
}
