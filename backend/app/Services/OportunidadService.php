<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Validation\Validador;

/**
 * Oportunidades de difusión externa (RF-48..RF-51): Empleos Perú, MYPE locales y
 * otras fuentes. Cada oportunidad identifica su fuente. La desactivación conserva
 * el registro (RN-12).
 */
class OportunidadService
{
    public const FUENTES = ['empleos_peru', 'mype_local', 'otro'];

    private OportunidadModel $oportunidades;

    public function __construct(?OportunidadModel $oportunidades = null)
    {
        $this->oportunidades = $oportunidades ?? model(OportunidadModel::class);
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros): array
    {
        $builder = $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social, e.ruc')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT');

        if (! empty($filtros['fuente'])) {
            $builder->where('o.fuente', $filtros['fuente']);
        }
        if (isset($filtros['activo']) && $filtros['activo'] !== '') {
            $builder->where('o.activo', (int) $filtros['activo']);
        }

        return $builder->orderBy('o.created_at', 'DESC')->limit(300)->get()->getResultArray();
    }

    /**
     * Oportunidades activas para difusión a los ciudadanos (RF-48).
     *
     * @return list<array<string, mixed>>
     */
    public function publicas(): array
    {
        return $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT')
            ->where('o.activo', 1)
            ->where('o.fecha_publicacion <=', date('Y-m-d'))
            ->orderBy('o.created_at', 'DESC')
            ->limit(200)
            ->get()
            ->getResultArray();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos): int
    {
        $datos = $this->validar($datos);
        $this->oportunidades->insert($datos);

        return (int) $this->oportunidades->getInsertID();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $this->exigir($id);
        $this->oportunidades->update($id, $this->validar($datos));
    }

    public function cambiarActivacion(int $id, bool $activo): void
    {
        $this->exigir($id);
        $this->oportunidades->update($id, ['activo' => (int) $activo]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        Validador::validar($datos, [
            'fuente'     => ['required', 'enum:' . implode(',', self::FUENTES)],
            'titulo'     => ['required', 'max:200'],
            'descripcion' => ['max:10000'],
            'enlace'     => ['max:300'],
            'fecha_publicacion' => ['regex:/^\d{4}-\d{2}-\d{2}$/'],
            'empresa_id' => ['regex:/^\d+$/'],
        ]);

        $enlace = $datos['enlace'] ?? null;
        if ($enlace !== null && $enlace !== '' && ! filter_var($enlace, FILTER_VALIDATE_URL)) {
            throw ApiException::validacion('El enlace debe ser una URL válida (https://…).', ['El enlace debe ser una URL válida (https://…).']);
        }

        $empresaId = $datos['empresa_id'] ?? null;
        if ($empresaId !== null && $empresaId !== '') {
            $existe = $this->oportunidades->db->table('empresas')->where('id', (int) $empresaId)->countAllResults();
            if (! $existe) {
                throw ApiException::validacion('La empresa indicada no existe.', ['La empresa indicada no existe.']);
            }
        }

        return [
            'fuente'            => $datos['fuente'],
            'empresa_id'        => $empresaId ? (int) $empresaId : null,
            'titulo'            => $datos['titulo'],
            'descripcion'       => $datos['descripcion'] ?? null,
            'enlace'            => $enlace ?: null,
            'fecha_publicacion' => $datos['fecha_publicacion'] ?? date('Y-m-d'),
            'activo'            => 1,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function exigir(int $id): array
    {
        $fila = $this->oportunidades->find($id);
        if ($fila === null) {
            throw ApiException::noEncontrado('La oportunidad no existe.');
        }

        return $fila;
    }
}
