<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
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
        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        return $this->ok(
            (new DashboardService())->empresa(service('guard')->id(), $desde, $hasta),
            'Indicadores de su empresa.',
        );
    }

    /**
     * Foto de perfil de la empresa (solo la propia). Multipart: campo "logo".
     */
    public function subirLogo()
    {
        $archivo = $this->request->getFile('logo');
        if ($archivo === null) {
            throw ApiException::validacion('Debe adjuntar una imagen en el campo "logo".', ['Debe adjuntar una imagen.']);
        }

        (new EmpresaService())->subirLogo(service('guard')->id(), $archivo);

        return $this->sinContenido('Foto de perfil actualizada.');
    }

    public function eliminarLogo()
    {
        (new EmpresaService())->eliminarLogo(service('guard')->id());

        return $this->sinContenido('Foto de perfil eliminada.');
    }

    /**
     * Conteos de pendientes para los indicadores de la sidebar (ofertas
     * rechazadas y postulaciones por revisar), acotados a la empresa de la sesión.
     */
    public function pendientes()
    {
        return $this->ok(
            (new DashboardService())->pendientesEmpresa(service('guard')->id()),
            'Pendientes de atención.',
        );
    }
}
