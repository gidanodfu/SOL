<?php

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Services\DashboardService;
use App\Services\EmpresaService;

/**
 * Acceso de la empresa a su propia información (RF-10) e indicadores.
 * La autorización (es SU empresa) la resuelve el backend consultando el usuario
 * de la sesión (RT-05).
 */
class PerfilController extends BaseApiController
{
    public function index()
    {
        return $this->ok(
            (new EmpresaService())->deUsuario(service('guard')->id()),
            'Datos de su empresa.',
        );
    }

    public function update()
    {
        (new EmpresaService())->actualizarPropia(service('guard')->id(), $this->cuerpo());

        return $this->sinContenido('Datos de su empresa actualizados.');
    }

    public function dashboard()
    {
        return $this->ok(
            (new DashboardService())->empresa(service('guard')->id()),
            'Indicadores de su empresa.',
        );
    }
}
