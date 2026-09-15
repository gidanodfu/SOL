<?php

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\ContratacionService;

/**
 * Supervisión municipal de contrataciones (RF-58). Consulta global, sin borrado.
 */
class ContratacionesController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'desde' => $this->request->getGet('desde'),
            'hasta' => $this->request->getGet('hasta'),
        ], static fn ($v) => $v !== null && $v !== '');

        return $this->ok((new ContratacionService())->listarGlobal($filtros), 'Contrataciones registradas.');
    }
}
