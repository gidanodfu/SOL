<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\DashboardService;

/**
 * Dashboard municipal con indicadores de gestión del empleo (RF-52..RF-60).
 * Filtro opcional por rango de fechas AAAA-MM-DD (RF-60).
 */
class DashboardController extends BaseApiController
{
    public function index()
    {
        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        return $this->ok(
            (new DashboardService())->administrador($desde, $hasta),
            'Indicadores de gestión del empleo.',
        );
    }

    /**
     * Conteos de pendientes para los indicadores de la sidebar (ofertas por
     * revisar y solicitudes por resolver).
     */
    public function pendientes()
    {
        return $this->ok(
            (new DashboardService())->pendientesAdmin(),
            'Pendientes de atención.',
        );
    }

    /**
     * Estadísticas de empleabilidad: empleos generados, empresas que los generan,
     * empleos vigentes por empresa y situación de las contrataciones.
     */
    public function empleabilidad()
    {
        return $this->ok(
            (new DashboardService())->empleabilidad(),
            'Estadísticas de empleabilidad.',
        );
    }
}
