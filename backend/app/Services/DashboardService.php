<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Repositories\DashboardRepository;
use App\Repositories\EmpresaRepository;

/**
 * Indicadores de los dashboards (RF-52..RF-60). Filtros por rango de fechas con
 * formato Y-m-d (RF-60).
 */
class DashboardService
{
    private DashboardRepository $repositorio;

    private EmpresaRepository $empresas;

    private PostulanteModel $postulantes;

    public function __construct(
        ?DashboardRepository $repositorio = null,
        ?EmpresaRepository $empresas = null,
        ?PostulanteModel $postulantes = null,
    ) {
        $this->repositorio = $repositorio ?? new DashboardRepository();
        $this->empresas    = $empresas ?? new EmpresaRepository();
        $this->postulantes = $postulantes ?? model(PostulanteModel::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function administrador(?string $desde, ?string $hasta): array
    {
        [$desde, $hasta] = $this->validarRango($desde, $hasta);

        return $this->repositorio->administrador($desde, $hasta);
    }

    /**
     * @return array<string, mixed>
     */
    public function empresa(int $usuarioId): array
    {
        $empresa = $this->empresas->porUserId($usuarioId);
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        return $this->repositorio->empresa((int) $empresa['id']);
    }

    /**
     * @return array<string, mixed>
     */
    public function postulante(int $usuarioId): array
    {
        $postulante = $this->postulantes->porUserId($usuarioId);
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        return $this->repositorio->postulante((int) $postulante->id);
    }

    /**
     * @return array{?string, ?string}
     */
    private function validarRango(?string $desde, ?string $hasta): array
    {
        foreach ([$desde, $hasta] as $fecha) {
            if ($fecha !== null && $fecha !== '' && ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
                throw ApiException::validacion('El rango de fechas debe usar el formato AAAA-MM-DD.', ['El rango de fechas debe usar el formato AAAA-MM-DD.']);
            }
        }

        if (($desde && $hasta) && strtotime($hasta) < strtotime($desde)) {
            throw ApiException::validacion('La fecha final no puede ser anterior a la inicial.', ['La fecha final no puede ser anterior a la inicial.']);
        }

        return [$desde ?: null, $hasta ?: null];
    }
}
