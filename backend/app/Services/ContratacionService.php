<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\ContratacionModel;
use App\Validation\Validador;

/**
 * Registro de contrataciones resultado de la intermediación (RF-58). Solo puede
 * registrar una contratación la empresa dueña de una postulación en estado
 * "seleccionado" (RN-18). Una postulación admite una sola contratación.
 */
class ContratacionService
{
    private ContratacionModel $contrataciones;

    public function __construct(?ContratacionModel $contrataciones = null)
    {
        $this->contrataciones = $contrataciones ?? model(ContratacionModel::class);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listarDeEmpresa(int $empresaId): array
    {
        return $this->base()->where('c.empresa_id', $empresaId)
            ->orderBy('c.fecha_contratacion', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * Postulaciones seleccionadas de la empresa que aún no tienen contratación
     * registrada (opciones para registrar un contrato).
     *
     * @return list<array<string, mixed>>
     */
    public function opcionesDeEmpresa(int $empresaId): array
    {
        return $this->contrataciones->db->table('postulaciones p')
            ->select('p.id, po.nombres, po.apellidos, po.dni, of.puesto, p.fecha_postulacion')
            ->join('postulantes po', 'po.id = p.postulante_id')
            ->join('ofertas of', 'of.id = p.oferta_id')
            ->where('p.empresa_id', $empresaId)
            ->where('p.estado', 'seleccionado')
            ->where('p.activo', 1)
            ->where('NOT EXISTS (SELECT 1 FROM contrataciones c WHERE c.postulacion_id = p.id)', null, false)
            ->orderBy('p.fecha_postulacion', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listarGlobal(array $filtros): array
    {
        $builder = $this->base();

        if (! empty($filtros['desde'])) {
            $builder->where('c.fecha_contratacion >=', $filtros['desde']);
        }
        if (! empty($filtros['hasta'])) {
            $builder->where('c.fecha_contratacion <=', $filtros['hasta']);
        }

        return $builder->orderBy('c.fecha_contratacion', 'DESC')->limit(300)->get()->getResultArray();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function registrar(int $empresaId, array $datos): int
    {
        if (empty($datos['postulacion_id'])) {
            throw ApiException::validacion('Indique la postulación seleccionada.', ['Indique la postulación seleccionada.']);
        }

        $postulacion = $this->postulacionDeEmpresa((int) $datos['postulacion_id'], $empresaId);
        if ($postulacion['estado'] !== 'seleccionado') {
            throw ApiException::conflicto('Solo puede registrar la contratación de un candidato seleccionado.');
        }

        $yaRegistrado = $this->contrataciones->where('postulacion_id', (int) $postulacion['id'])->countAllResults();
        if ($yaRegistrado) {
            throw ApiException::conflicto('Esta postulación ya tiene una contratación registrada.');
        }

        $datos = $this->validar($datos);

        $this->contrataciones->insert([
            'postulacion_id'      => (int) $postulacion['id'],
            'empresa_id'          => $empresaId,
            'oferta_id'           => (int) $postulacion['oferta_id'],
            'postulante_id'       => (int) $postulacion['postulante_id'],
            'fecha_contratacion'  => $datos['fecha_contratacion'],
            'cargo'               => $datos['cargo'],
            'modalidad'           => $datos['modalidad'] ?? null,
            'remuneracion'        => $datos['remuneracion'] ?? null,
            'observaciones'       => $datos['observaciones'] ?? null,
        ]);

        return (int) $this->contrataciones->getInsertID();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $empresaId, int $id, array $datos): void
    {
        $contrato = $this->contrataciones->find($id);
        if ($contrato === null || (int) $contrato['empresa_id'] !== $empresaId) {
            throw ApiException::noEncontrado('La contratación no existe.');
        }

        $datos = $this->validar($datos + ['postulacion_id' => $contrato['postulacion_id']]);
        $this->contrataciones->update($id, [
            'fecha_contratacion' => $datos['fecha_contratacion'],
            'cargo'              => $datos['cargo'],
            'modalidad'          => $datos['modalidad'] ?? null,
            'remuneracion'       => $datos['remuneracion'] ?? null,
            'observaciones'      => $datos['observaciones'] ?? null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function postulacionDeEmpresa(int $postulacionId, int $empresaId): array
    {
        $fila = $this->contrataciones->db->table('postulaciones')
            ->select('id, oferta_id, postulante_id, estado')
            ->where('id', $postulacionId)
            ->where('empresa_id', $empresaId)
            ->get()
            ->getRowArray();

        if ($fila === null) {
            throw ApiException::noEncontrado('La postulación no existe.');
        }

        return $fila;
    }

    /**
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        Validador::validar($datos, [
            'fecha_contratacion' => ['required', 'regex:/^\d{4}-\d{2}-\d{2}$/'],
            'cargo'              => ['required', 'max:150'],
            'modalidad'          => ['max:60'],
            'remuneracion'       => ['regex:/^\d{1,10}(\.\d{1,2})?$/'],
            'observaciones'      => ['max:10000'],
        ]);

        return $datos;
    }

    private function base(): \CodeIgniter\Database\BaseBuilder
    {
        return $this->contrataciones->db->table('contrataciones c')
            ->select('c.*, po.dni, po.nombres, po.apellidos, of.puesto, emp.razon_social, emp.ruc')
            ->join('postulantes po', 'po.id = c.postulante_id')
            ->join('ofertas of', 'of.id = c.oferta_id')
            ->join('empresas emp', 'emp.id = c.empresa_id');
    }
}
