<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\ContratacionService;
use App\Services\DashboardService;
use App\Services\ReporteExcelService;

/**
 * Reportes de efectividad por periodo (RF-52..RF-60). Combina los indicadores
 * municipales con el detalle de contrataciones dentro del rango.
 */
class ReportesController extends BaseApiController
{
    public function index()
    {
        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        $indicadores = (new DashboardService())->administrador($desde, $hasta);
        $contrataciones = (new ContratacionService())->listarGlobal(array_filter([
            'desde' => $desde,
            'hasta' => $hasta,
        ], static fn ($v) => $v !== null));

        return $this->ok([
            'indicadores'    => $indicadores,
            'contrataciones' => $contrataciones,
        ], 'Reportes de efectividad.');
    }

    /**
     * Exportación a Excel (.xlsx) del reporte por periodo (RF-60). Construye un
     * libro con resumen de indicadores, actividad mensual, desgloses por estado
     * y el detalle de contrataciones. La validación del rango de fechas la
     * realiza `DashboardService::validarRango` (422 si es inválido).
     */
    public function excel()
    {
        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        $bytes = (new ReporteExcelService())->generar($desde, $hasta);

        $nombre = 'reporte-empleo';
        if ($desde !== null && $hasta !== null) {
            $nombre .= '-' . $desde . '_' . $hasta;
        }
        $nombre .= '.xlsx';

        return $this->response
            ->setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->setHeader('Content-Disposition', 'attachment; filename="' . $nombre . '"')
            ->setBody($bytes);
    }

    /**
     * Exportación CSV del reporte (RF-60). Incluye resumen de indicadores y el
     * detalle de contrataciones del periodo.
     */
    public function csv()
    {
        $desde = $this->request->getGet('desde') ?: null;
        $hasta = $this->request->getGet('hasta') ?: null;

        $indicadores = (new DashboardService())->administrador($desde, $hasta);
        $contrataciones = (new ContratacionService())->listarGlobal(array_filter([
            'desde' => $desde,
            'hasta' => $hasta,
        ], static fn ($v) => $v !== null));

        $filas = [['Reporte de efectividad - Sistema de Empleo MDJLO', '']];
        $filas[] = ['Periodo', ($desde ?? 'inicio') . ' a ' . ($hasta ?? 'hoy')];
        $filas[] = [];
        $filas[] = ['Empresas activas', $indicadores['empresas']['activas']];
        $filas[] = ['Empresas con procesos', $indicadores['empresas_con_procesos']];
        $filas[] = ['Postulantes activos', $indicadores['postulantes_activos']];
        $filas[] = ['Postulaciones', array_sum($indicadores['postulaciones'])];
        $filas[] = ['Seleccionados', $indicadores['seleccionados']];
        $filas[] = ['Tasa de seleccion (%)', $indicadores['tasa_seleccion']];
        $filas[] = ['Contrataciones', $indicadores['contrataciones']];
        $filas[] = ['Tasa de contratacion (%)', $indicadores['tasa_contratacion']];
        $filas[] = ['Tiempo promedio a contacto (dias)', $indicadores['tiempo_promedio_contacto_dias'] ?? 'sin datos'];
        $filas[] = ['Tiempo promedio a seleccion (dias)', $indicadores['tiempo_promedio_seleccion_dias'] ?? 'sin datos'];
        $filas[] = [];
        $filas[] = ['Contrataciones del periodo', ''];
        $filas[] = ['Fecha', 'Empresa', 'RUC', 'Contratado', 'DNI', 'Oferta', 'Cargo', 'Modalidad', 'Remuneracion'];

        foreach ($contrataciones as $c) {
            $filas[] = [
                $c['fecha_contratacion'],
                $c['razon_social'],
                $c['ruc'],
                $c['nombres'] . ' ' . $c['apellidos'],
                $c['dni'],
                $c['puesto'],
                $c['cargo'],
                $c['modalidad'] ?? '',
                $c['remuneracion'] ?? '',
            ];
        }

        $csv = '';
        foreach ($filas as $fila) {
            $csv .= implode(';', array_map(static fn ($v) => '"' . str_replace('"', '""', (string) $v) . '"', $fila)) . "\r\n";
        }

        return $this->response
            ->setContentType('text/csv; charset=UTF-8')
            ->setHeader('Content-Disposition', 'attachment; filename="reporte-empleo.csv"')
            // BOM para compatibilidad con Excel.
            ->setBody("\xEF\xBB\xBF" . $csv);
    }
}
