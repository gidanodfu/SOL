<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\ContratacionService;
use App\Services\DashboardService;

/**
 * Supervisión municipal de contrataciones (RF-58). Consulta global, sin borrado.
 */
class ContratacionesController extends BaseApiController
{
    public function index()
    {
        // Mismo validador de rango que dashboard/reportes: formato y orden.
        [$desde, $hasta] = (new DashboardService())->validarRango(
            $this->request->getGet('desde'),
            $this->request->getGet('hasta'),
        );

        $filtros = array_filter(['desde' => $desde, 'hasta' => $hasta], static fn ($v) => $v !== null && $v !== '');

        return $this->ok((new ContratacionService())->listarGlobal($filtros), 'Contrataciones registradas.');
    }
}
