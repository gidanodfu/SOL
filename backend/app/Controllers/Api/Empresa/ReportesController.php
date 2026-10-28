<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Repositories\EmpresaRepository;
use App\Services\ReporteExcelService;
use App\Services\ReportePdfService;

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

    /**
     * Exportación PDF de la actividad de la empresa autenticada. La empresa se
     * resuelve solo desde la sesión; cualquier `empresa_id` de la URL se ignora.
     * Rango inválido responde 422 y empresa sin perfil responde 404.
     */
    public function pdf()
    {
        $empresa = (new EmpresaRepository())->porUserId(service('guard')->id());
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        $bytes = (new ReportePdfService())->generarEmpresa($empresa, $desde, $hasta);

        $nombre = 'reporte-empresa';
        if ($desde !== null && $hasta !== null) {
            $nombre .= '-' . $desde . '_' . $hasta;
        } elseif ($desde !== null) {
            $nombre .= '-desde-' . $desde;
        } elseif ($hasta !== null) {
            $nombre .= '-hasta-' . $hasta;
        } else {
            $nombre .= '-' . date('Y-m-d');
        }

        return $this->respuestaPdf($bytes, $nombre . '.pdf');
    }
}
