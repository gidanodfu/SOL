<?php

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;

/**
 * Postulaciones de un postulante (RF-30..RF-32): bandeja con oferta y empresa.
 */
class PostulacionRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function dePostulante(int $postulanteId): array
    {
        return $this->db->table('postulaciones p')
            ->select('p.id, p.estado, p.activo, p.fecha_postulacion, p.oferta_id,
                      of.puesto, of.ubicacion, of.remuneracion, of.fecha_cierre,
                      emp.razon_social, emp.ruc, cat.nombre AS categoria_nombre')
            ->join('ofertas of', 'of.id = p.oferta_id')
            ->join('empresas emp', 'emp.id = p.empresa_id')
            ->join('categorias cat', 'cat.id = of.categoria_id', 'LEFT')
            ->where('p.postulante_id', $postulanteId)
            ->orderBy('p.fecha_postulacion', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function deEmpresa(int $empresaId, ?string $estado = null, ?int $ofertaId = null): array
    {
        $builder = $this->db->table('postulaciones p')
            ->select('p.id, p.estado, p.activo, p.fecha_postulacion, p.oferta_id,
                      of.puesto, of.ubicacion, of.estado AS oferta_estado, of.fecha_cierre,
                      po.id AS postulante_id, po.dni, po.nombres, po.apellidos, po.telefono')
            ->join('ofertas of', 'of.id = p.oferta_id')
            ->join('postulantes po', 'po.id = p.postulante_id')
            ->where('p.empresa_id', $empresaId)
            // RF-34/RN-16: pendientes primero y, dentro de cada estado, más recientes arriba.
            ->orderBy('FIELD(p.estado, "pendiente", "en_revision", "preseleccionado", "contactado", "seleccionado", "no_seleccionado")', '', false)
            ->orderBy('p.fecha_postulacion', 'DESC');

        if ($estado !== null) {
            $builder->where('p.estado', $estado);
        }

        if ($ofertaId !== null) {
            $builder->where('p.oferta_id', $ofertaId);
        }

        return $builder->limit(300)->get()->getResultArray();
    }

    /**
     * Postulación perteneciente a la empresa (RT-05). Devuelve además el id del
     * postulante para autorizar la consulta de su CV (RT-CV-04).
     *
     * @return array<string, mixed>|null
     */
    public function deEmpresaPorId(int $empresaId, int $id): ?array
    {
        $fila = $this->db->table('postulaciones p')
            ->select('p.*, of.puesto, of.ubicacion, of.fecha_cierre, of.remuneracion, of.estado AS oferta_estado,
                      po.dni')
            ->join('ofertas of', 'of.id = p.oferta_id')
            ->join('postulantes po', 'po.id = p.postulante_id')
            ->where('p.id', $id)
            ->where('p.empresa_id', $empresaId)
            ->get()
            ->getRowArray();

        return $fila ?: null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function delPostulante(int $postulanteId, int $id): ?array
    {
        $fila = $this->db->table('postulaciones')
            ->where('id', $id)
            ->where('postulante_id', $postulanteId)
            ->get()
            ->getRowArray();

        return $fila ?: null;
    }
}
