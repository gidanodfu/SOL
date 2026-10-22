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
        if (! empty($filtros['q'])) {
            $builder->groupStart()
                ->like('s.ruc', $filtros['q'])
                ->orLike('s.razon_social', $filtros['q'])
                ->orLike('s.representante', $filtros['q'])
                ->orLike('s.email', $filtros['q'])
                ->groupEnd();
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

    /**
     * Bloquea la solicitud para resolverla dentro de una transacción (evita dos
     * aprobaciones simultáneas).
     *
     * @return array<string, mixed>|null
     */
    public function obtenerParaActualizar(int $id): ?array
    {
        return $this->db->query('SELECT * FROM solicitudes_empresa WHERE id = ? FOR UPDATE', [$id])
            ->getRowArray() ?: null;
    }

    private function base(): \CodeIgniter\Database\BaseBuilder
    {
        return $this->db->table('solicitudes_empresa s')
            ->select('s.*, admin.nombres AS resuelto_por_nombre, admin.apellidos AS resuelto_por_apellido')
            ->select('e.id AS empresa_id, e.estado AS empresa_estado, eu.estado AS empresa_usuario_estado')
            ->select(
                '(SELECT MAX(a.usado_en) FROM activaciones a WHERE a.user_id = e.user_id) AS activada_en,
                 COALESCE((SELECT MAX(a.usado_en) FROM activaciones a WHERE a.user_id = e.user_id),
                          CASE WHEN eu.estado = \'activo\' THEN COALESCE(eu.updated_at, e.updated_at, e.created_at) ELSE NULL END) AS activada_en_efectiva',
                false,
            )
            ->join('users admin', 'admin.id = s.resuelto_por', 'LEFT')
            ->join('empresas e', 'e.ruc = s.ruc', 'LEFT')
            ->join('users eu', 'eu.id = e.user_id', 'LEFT');
    }
}
