<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Postulante;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Services\CvService;
use App\Services\DashboardService;
use App\Services\PostulanteService;

/**
 * Perfil y CV del postulante (RF-19..RF-21). Solo opera sobre el perfil propio
 * (identidad resuelta desde la sesión, nunca por parámetros del cliente).
 */
class PerfilController extends BaseApiController
{
    public function index()
    {
        return $this->ok(
            (new PostulanteService())->perfil(service('guard')->id()),
            'Perfil laboral completo.',
        );
    }

    public function update()
    {
        (new PostulanteService())->actualizarBasico(service('guard')->id(), $this->cuerpo());

        return $this->sinContenido('Perfil actualizado correctamente.');
    }

    public function dashboard()
    {
        return $this->ok(
            (new DashboardService())->postulante(service('guard')->id()),
            'Indicadores de su perfil.',
        );
    }

    /**
     * Foto de perfil del postulante autenticado (multipart, campo "foto").
     * Se normaliza a 800x800 (cover) en el backend.
     */
    public function subirFoto()
    {
        $foto = $this->request->getFile('foto');
        if ($foto === null) {
            throw ApiException::validacion('Debe adjuntar una imagen en el campo "foto".', ['Debe adjuntar una imagen.']);
        }

        (new PostulanteService())->subirFoto(service('guard')->id(), $foto);

        return $this->sinContenido('Foto de perfil actualizada.');
    }

    public function eliminarFoto()
    {
        (new PostulanteService())->eliminarFoto(service('guard')->id());

        return $this->sinContenido('Foto de perfil eliminada.');
    }
}
