<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Exportación a Excel (.xlsx) del reporte municipal por periodo (RF-60).
 * Reutiliza los indicadores de DashboardService y el detalle de contrataciones
 * de ContratacionService (sin consultas duplicadas).
 *
 * Hojas generadas: Resumen, Actividad mensual, Ofertas por estado,
 * Postulaciones por estado y Contrataciones.
 */
class ReporteExcelService
{
    private const COLOR_ENCABEZADO = '1F4E79';

    private const COLOR_TITULO = '0E2A47';

    private const ORDEN_OFERTAS = ['publicada', 'borrador', 'cerrada'];

    private const ETIQUETA_ESTADO_OFERTA = [
        'borrador'  => 'Borrador',
        'publicada' => 'Publicada',
        'cerrada'   => 'Cerrada',
    ];

    private const ORDEN_POSTULACIONES = ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'];

    private const ETIQUETA_ESTADO_POSTULACION = [
        'pendiente'       => 'Pendiente',
        'en_revision'     => 'En revisión',
        'preseleccionado' => 'Preseleccionado',
        'contactado'      => 'Contactado',
        'seleccionado'    => 'Seleccionado',
        'no_seleccionado' => 'No seleccionado',
    ];

    /**
     * Genera el libro Excel y devuelve sus bytes.
     */
    public function generar(?string $desde, ?string $hasta): string
    {
        $indicadores    = (new DashboardService())->administrador($desde, $hasta);
        $contrataciones = (new ContratacionService())->listarGlobal(array_filter([
            'desde' => $desde,
            'hasta' => $hasta,
        ], static fn ($v) => $v !== null));

        $libro = new Spreadsheet();
        $libro->getActiveSheet()->setTitle('Resumen');
        $this->hojaResumen($libro->getActiveSheet(), $indicadores, $desde, $hasta);
        $this->hojaActividadMensual($libro->createSheet()->setTitle('Actividad mensual'), $indicadores['actividad_mensual']);
        $this->hojaConteo($libro->createSheet()->setTitle('Ofertas por estado'), self::ORDEN_OFERTAS, self::ETIQUETA_ESTADO_OFERTA, $indicadores['ofertas']);
        $this->hojaConteo($libro->createSheet()->setTitle('Postulaciones por estado'), self::ORDEN_POSTULACIONES, self::ETIQUETA_ESTADO_POSTULACION, $indicadores['postulaciones']);
        $this->hojaContrataciones($libro->createSheet()->setTitle('Contrataciones'), $contrataciones);

        $ruta = tempnam(sys_get_temp_dir(), 'reporte');
        if ($ruta === false) {
            throw new \RuntimeException('No se pudo crear el archivo temporal del reporte.');
        }

        try {
            (new Xlsx($libro))->save($ruta);
            $bytes = (string) file_get_contents($ruta);
        } finally {
            $libro->disconnectWorksheets();
            unlink($ruta);
        }

        return $bytes;
    }

    /**
     * @param array<string, mixed> $indicadores
     */
    private function hojaResumen(Worksheet $hoja, array $indicadores, ?string $desde, ?string $hasta): void
    {
        $hoja->getColumnDimension('A')->setWidth(46);
        $hoja->getColumnDimension('B')->setWidth(22);

        $hoja->setCellValue('A1', 'Reporte de gestión de empleo');
        $hoja->getStyle('A1')->getFont()->setBold(true)->setSize(16)->getColor()->setARGB('FF' . self::COLOR_TITULO);

        $periodo = ($desde ?? 'Inicio') . ' a ' . ($hasta ?? 'Hoy');
        $hoja->setCellValue('A2', 'Periodo: ' . $periodo . '   ·   Generado: ' . date('d/m/Y H:i'));
        $hoja->getStyle('A2')->getFont()->setColor(new Color('FF6B7A8A'));

        $metricas = [
            'Empresas activas'                 => $indicadores['empresas']['activas'] . ' de ' . $indicadores['empresas']['total'],
            'Empresas con procesos'            => $indicadores['empresas_con_procesos'],
            'Postulantes activos'              => $indicadores['postulantes_activos'],
            'Ofertas totales (acumulado)'      => array_sum($indicadores['ofertas']),
            'Postulaciones del periodo'        => array_sum($indicadores['postulaciones']),
            'Seleccionados del periodo'        => $indicadores['seleccionados'],
            'Tasa de selección (%)'            => $indicadores['tasa_seleccion'],
            'Contrataciones del periodo'       => $indicadores['contrataciones'],
            'Tasa de contratación (%)'         => $indicadores['tasa_contratacion'],
            'Tiempo promedio a contacto (días)'  => $indicadores['tiempo_promedio_contacto_dias'] ?? 'Sin datos',
            'Tiempo promedio a selección (días)' => $indicadores['tiempo_promedio_seleccion_dias'] ?? 'Sin datos',
        ];

        $fila = 4;
        foreach ($metricas as $etiqueta => $valor) {
            $hoja->setCellValue("A{$fila}", $etiqueta);
            $hoja->setCellValue("B{$fila}", $valor);
            ++$fila;
        }

        $ultima = $fila - 1;
        $hoja->getStyle("A4:B{$ultima}")->getBorders()->getBottom()
            ->setBorderStyle(Border::BORDER_HAIR);
        $hoja->getStyle('B4:B' . $ultima)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
    }

    /**
     * @param list<array{mes?: string, etiqueta: string, total: int}> $actividad
     */
    private function hojaActividadMensual(Worksheet $hoja, array $actividad): void
    {
        $filas = array_map(static fn ($item) => [$item['etiqueta'], (int) $item['total']], $actividad);
        $filas[] = ['Total', array_sum(array_map(static fn ($item) => (int) $item['total'], $actividad))];

        $this->encabezarTabla($hoja, ['Mes', 'Postulaciones']);
        $this->escribirTabla($hoja, $filas);
        $this->resaltarTotal($hoja, count($filas));
    }

    /**
     * @param list<string> $orden
     * @param array<string, string> $etiquetas
     * @param array<string, int> $conteos
     */
    private function hojaConteo(Worksheet $hoja, array $orden, array $etiquetas, array $conteos): void
    {
        $filas = [];
        foreach ($orden as $clave) {
            $filas[] = [$etiquetas[$clave], (int) ($conteos[$clave] ?? 0)];
        }
        $filas[] = ['Total', array_sum(array_map(static fn ($f) => (int) $f[1], $filas))];

        $this->encabezarTabla($hoja, ['Estado', 'Cantidad']);
        $this->escribirTabla($hoja, $filas);
        $this->resaltarTotal($hoja, count($filas));
    }

    /**
     * @param list<array<string, mixed>> $contrataciones
     */
    private function hojaContrataciones(Worksheet $hoja, array $contrataciones): void
    {
        $filas = [];
        foreach ($contrataciones as $c) {
            $remuneracion = isset($c['remuneracion']) && is_numeric($c['remuneracion']) ? (float) $c['remuneracion'] : '';
            $filas[] = [
                isset($c['fecha_contratacion']) ? date('d/m/Y', strtotime($c['fecha_contratacion'])) : '',
                $c['razon_social'] ?? '',
                $c['ruc'] ?? '',
                trim(($c['nombres'] ?? '') . ' ' . ($c['apellidos'] ?? '')),
                $c['dni'] ?? '',
                $c['puesto'] ?? '',
                $c['cargo'] ?? '',
                $c['modalidad'] ?? '',
                $remuneracion,
            ];
        }

        $this->encabezarTabla($hoja, ['Fecha', 'Empresa', 'RUC', 'Contratado', 'DNI', 'Oferta', 'Cargo', 'Modalidad', 'Remuneración (S/)'], 40);
        $this->escribirTabla($hoja, $filas);
        if ($filas !== []) {
            $hoja->getStyle('I2:I' . (count($filas) + 1))->getNumberFormat()->setFormatCode('#,##0.00');
        }
    }

    /**
     * @param list<string> $encabezados
     */
    private function encabezarTabla(Worksheet $hoja, array $encabezados, int $primeraColumna = 12): void
    {
        $hoja->fromArray([$encabezados], null, 'A1');
        $ultimaCol = Coordinate::stringFromColumnIndex(count($encabezados));
        $rango = "A1:{$ultimaCol}1";
        $hoja->getStyle($rango)->getFont()->setBold(true)->getColor()->setARGB('FFFFFFFF');
        $hoja->getStyle($rango)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setARGB('FF' . self::COLOR_ENCABEZADO);
        $hoja->getStyle($rango)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $hoja->freezePane('A2');

        foreach (range('A', $ultimaCol) as $col) {
            $hoja->getColumnDimension($col)->setWidth($col === 'A' ? $primeraColumna : $primeraColumna - 2);
        }
    }

    /**
     * @param list<list<mixed>> $filas
     */
    private function escribirTabla(Worksheet $hoja, array $filas): void
    {
        if ($filas === []) {
            return;
        }

        $hoja->fromArray($filas, null, 'A2');
    }

    private function resaltarTotal(Worksheet $hoja, int $cantidadFilas): void
    {
        if ($cantidadFilas < 2) {
            return;
        }

        $fila = $cantidadFilas + 1;
        $ultimaCol = $hoja->getHighestColumn();
        $hoja->getStyle("A{$fila}:{$ultimaCol}{$fila}")->getFont()->setBold(true);
    }
}
