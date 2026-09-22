<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Repositories\EmpresaRepository;
use App\Services\ReporteExcelService;

/**
 * Reportes de la empresa autenticada (RF-33..RF-40, RF-58). El alcance de los
 * datos lo determina SIEMPRE la empresa asociada a la sesión (RT-05): los
 * parámetros del cliente no pueden cambiarlo.
 */
class ReportesController extends BaseApiController
{
    /**
     * Exportación a Excel (.xlsx) de la actividad de la empresa en el periodo.
     * Filtros opcionales `desde`/`hasta` (AAAA-MM-DD); rango inválido responde 422.
     */
    public function excel()
    {
        $empresa = (new EmpresaRepository())->porUserId(service('guard')->id());
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        $bytes = (new ReporteExcelService())->generarEmpresa($empresa, $desde, $hasta);

        return $this->response
            ->setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->setHeader('Content-Disposition', 'attachment; filename="reporte-empresa-' . date('Y-m-d') . '.xlsx"')
            ->setBody($bytes);
    }
}
