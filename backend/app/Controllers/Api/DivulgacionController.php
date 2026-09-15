<?php

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
}
