<?php

// SPDX-License-Identifier: MIT

namespace App\Repositories;

use App\Models\OfertaHabilidadModel;
use CodeIgniter\Database\BaseConnection;

/**
 * Consultas de ofertas laborales con sus relaciones (empresa, categoría,
 * habilidades). Soportan la bandeja de la empresa y la supervisión municipal.
 */
class OfertaRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function porEmpresa(int $empresaId): array
    {
        return $this->base()
            ->where('ofertas.empresa_id', $empresaId)
            ->orderBy('ofertas.updated_at', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * Bandeja municipal: pendientes de validación primero y luego publicadas (RF-24/25).
     *
     * @return list<array<string, mixed>>
     */
    public function paraAdmin(?string $estado = null): array
    {
        $builder = $this->base()
            ->orderBy('ofertas.estado', 'ASC')
            ->orderBy('ofertas.created_at', 'DESC');

        if ($estado !== null) {
            $builder->where('ofertas.estado', $estado);
        }

        return $builder->get()->getResultArray();
    }

    /**
     * Ofertas publicadas y vigentes para los postulantes (RF-27/RF-28).
     * Criterios: categoría, ubicación, formación y experiencia.
     *
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function publicadas(array $filtros): array
    {
        $builder = $this->base()
            ->where('ofertas.estado', 'publicada')
            ->groupStart()
                ->where('ofertas.fecha_cierre IS NULL')
                ->orWhere('ofertas.fecha_cierre >=', date('Y-m-d'))
            ->groupEnd()
            ->orderBy('ofertas.fecha_publicacion', 'DESC')
            ->orderBy('ofertas.created_at', 'DESC');

        if (! empty($filtros['categoria_id'])) {
            $builder->where('ofertas.categoria_id', (int) $filtros['categoria_id']);
        }
        if (! empty($filtros['ubicacion'])) {
            $builder->like('ofertas.ubicacion', $filtros['ubicacion']);
        }
        if (! empty($filtros['formacion'])) {
            $builder->like('ofertas.formacion_requerida', $filtros['formacion']);
        }
        if (! empty($filtros['experiencia'])) {
            $builder->like('ofertas.experiencia_requerida', $filtros['experiencia']);
        }

        return $builder->limit(200)->get()->getResultArray();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function detalle(int $id): ?array
    {
        $fila = $this->base()->where('ofertas.id', $id)->get()->getRowArray();
        if ($fila === null) {
            return null;
        }

        $fila['habilidades'] = (new OfertaHabilidadModel())->deOferta($id);
        $fila['cantidad_postulaciones'] = (int) $this->db->table('postulaciones')
            ->where('oferta_id', $id)
            ->where('activo', 1)
            ->countAllResults();

        return $fila;
    }

    private function base(): \CodeIgniter\Database\BaseBuilder
    {
        return $this->db->table('ofertas')
            ->select('ofertas.*, categorias.nombre AS categoria_nombre, empresas.ruc, empresas.razon_social')
            ->join('categorias', 'categorias.id = ofertas.categoria_id', 'LEFT')
            ->join('empresas', 'empresas.id = ofertas.empresa_id', 'LEFT');
    }
}
