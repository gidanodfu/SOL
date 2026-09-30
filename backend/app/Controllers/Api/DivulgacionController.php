<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api;

use App\Services\ActividadService;
use App\Services\OportunidadService;

/**
 * Difusión visible para cualquier usuario autenticado: ferias/actividades
 * programadas y oportunidades (Empleos Perú / MYPE). Solo lectura.
 */
class DivulgacionController extends BaseApiController
{
    public function actividades()
    {
        return $this->ok((new ActividadService())->listar([], true), 'Ferias y actividades programadas.');
    }

    public function oportunidades()
    {
        return $this->ok((new OportunidadService())->publicas(), 'Oportunidades de empleo.');
    }

    /**
     * Proxy público de la imagen de una actividad. El bucket es privado; la API
     * sirve el contenido (driver local o Supabase) sin exponer credenciales.
     */
    public function imagenActividad($id)
    {
        $imagen = (new ActividadService())->imagenContenido((int) $id);
        if ($imagen === null) {
            return $this->response
                ->setStatusCode(404)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode(['success' => false, 'message' => 'La actividad no tiene imagen.'], JSON_UNESCAPED_UNICODE));
        }

        return $this->response
            ->setStatusCode(200)
            ->setContentType($imagen['mime'])
            ->setHeader('Cache-Control', 'public, max-age=3600')
            ->setHeader('Content-Disposition', 'inline')
            ->setBody($imagen['contenido']);
    }
}
