<?php

// SPDX-License-Identifier: MIT

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;
use CodeIgniter\Database\BaseBuilder;

/**
 * Consultas de usuarios para administración y autenticación.
 */
class UsuarioRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @param array{rol?: string, estado?: string, q?: string} $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros, int $limite = 100, int $offset = 0): array
    {
        $builder = $this->base();
        $this->aplicarFiltros($builder, $filtros);

        return $builder->orderBy('users.created_at', 'DESC')
            ->limit($limite, $offset)
            ->get()
            ->getResultArray();
    }

    /**
     * @param array{rol?: string, estado?: string, q?: string} $filtros
     */
    public function contar(array $filtros): int
    {
        $builder = $this->base();
        $this->aplicarFiltros($builder, $filtros);

        return (int) $builder->countAllResults();
    }

    private function base(): BaseBuilder
    {
        // Columnas explícitas: password_hash nunca debe salir en la respuesta JSON
        // (RT-20/RNF-05). No usar users.* aunque la entidad tenga $hidden.
        return $this->db->table('users')
            ->select('users.id, users.username, users.rol, users.proveedor, users.nombres,
                users.apellidos, users.email, users.telefono, users.estado,
                users.ultimo_acceso, users.created_at, users.updated_at')
            ->select('empresas.id AS empresa_id, empresas.razon_social, empresas.estado AS empresa_estado')
            ->join('empresas', 'empresas.user_id = users.id', 'LEFT')
            ->select('postulantes.id AS postulante_id')
            ->join('postulantes', 'postulantes.user_id = users.id', 'LEFT');
    }

    private function aplicarFiltros(BaseBuilder $builder, array $filtros): void
    {
        if (! empty($filtros['rol'])) {
            $builder->where('users.rol', $filtros['rol']);
        }
        if (! empty($filtros['estado'])) {
            $builder->where('users.estado', $filtros['estado']);
        }
        if (! empty($filtros['q'])) {
            $builder->groupStart()
                ->like('users.username', $filtros['q'])
                ->orLike('users.nombres', $filtros['q'])
                ->orLike('users.apellidos', $filtros['q'])
                ->orLike('empresas.ruc', $filtros['q'])
                ->orLike('empresas.razon_social', $filtros['q'])
                ->orLike('postulantes.dni', $filtros['q'])
                ->groupEnd();
        }
    }
}
