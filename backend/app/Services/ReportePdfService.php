<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Repositories\DashboardRepository;
use App\Repositories\OfertaRepository;
use Dompdf\Dompdf;
use Dompdf\Options;
use RuntimeException;

/**
 * Exportación PDF de los reportes municipales y de empresa.
 *
 * Reutiliza exactamente las mismas fuentes que ReporteExcelService:
 * DashboardService/Repository, ContratacionService, PostulacionService y
 * OfertaRepository. No introduce consultas SQL paralelas para que el PDF y el
 * Excel no puedan discrepar en sus totales.
 *
 * El encabezado con el escudo se repite en todas las páginas mediante un
 * elemento `position: fixed` de Dompdf. El archivo institucional se copia a
 * `backend/public/sol-logo.png` para que exista también en la imagen de
 * producción; `ReportePdfServiceTest` verifica que ambas copias coinciden.
 */
class ReportePdfService
{
    private const AZUL = '#1F4E79';

    private const AZUL_OSCURO = '#0E2A47';

    private const AZUL_CLARO = '#EAF1F8';

    private const GRIS = '#5B6770';

    private const GRIS_LINEA = '#C9D3DD';

    private const ORDEN_OFERTAS = [
        'publicada',
        'vencida',
        'borrador',
        'cerrada',
        'pendiente',
        'observada',
        'rechazada',
    ];

    private const ETIQUETA_ESTADO_OFERTA = [
        'borrador'   => 'Borrador',
        'pendiente'  => 'Pendiente de revisión',
        'publicada'  => 'Publicada',
        'vencida'    => 'Vencida',
        'cerrada'    => 'Cerrada',
        'observada'  => 'Observada',
        'rechazada'  => 'Rechazada',
    ];

    private const ORDEN_POSTULACIONES = ['pendiente', 'en_revision', 'seleccionado', 'no_seleccionado'];

    private const ETIQUETA_ESTADO_POSTULACION = [
        'pendiente'       => 'Pendiente',
        'en_revision'     => 'En revisión',
        'seleccionado'    => 'Seleccionado',
        'no_seleccionado' => 'No seleccionado',
    ];

    /**
     * Reporte municipal. El rango se valida con la misma autoridad que el
     * dashboard y el Excel (DashboardService::validarRango); un rango inválido
     * lanza ApiException 422 y nunca se convierte en un reporte completo.
     */
    public function generar(?string $desde, ?string $hasta): string
    {
        $dashboard = new DashboardService();
        [$desde, $hasta] = $dashboard->validarRango($desde, $hasta);

        $indicadores    = $dashboard->administrador($desde, $hasta);
        $contrataciones = (new ContratacionService())->listarGlobal(array_filter([
            'desde' => $desde,
            'hasta' => $hasta,
        ], static fn ($valor) => $valor !== null));

        return $this->renderizar($this->construirHtmlAdministracion($indicadores, $contrataciones, $desde, $hasta));
    }

    /**
     * Reporte de la empresa autenticada. El `empresa_id` proviene exclusivamente
     * de la fila resuelta por sesión en el controlador; este método no acepta
     * un identificador alternativo.
     *
     * @param array<string, mixed> $empresa fila de `empresas` de la sesión
     */
    public function generarEmpresa(array $empresa, ?string $desde, ?string $hasta): string
    {
        $empresaId = (int) ($empresa['id'] ?? 0);
        if ($empresaId <= 0) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $dashboard = new DashboardService();
        [$desde, $hasta] = $dashboard->validarRango($desde, $hasta);

        // Mismas fuentes y mismos filtros que ReporteExcelService::generarEmpresa.
        $indicadores    = (new DashboardRepository())->empresa($empresaId, $desde, $hasta);
        $postulaciones  = (new PostulacionService())->listarDeEmpresa($empresaId, null, null, $desde, $hasta);
        $contrataciones = (new ContratacionService())->listarDeEmpresa($empresaId, $desde, $hasta);
        $ofertas        = (new OfertaRepository())->porEmpresa($empresaId, $desde, $hasta);

        return $this->renderizar($this->construirHtmlEmpresa(
            $empresa,
            $indicadores,
            $postulaciones,
            $contrataciones,
            $ofertas,
            $desde,
            $hasta,
        ));
    }

    /**
     * Construye el documento municipal completo (HTML + encabezado/pie).
     *
     * @param array<string, mixed> $indicadores
     * @param list<array<string, mixed>> $contrataciones
     */
    public function construirHtmlAdministracion(array $indicadores, array $contrataciones, ?string $desde, ?string $hasta): string
    {
        $periodo  = $this->periodo($desde, $hasta);
        $generado = $this->generado();

        $contenido = $this->tituloBloque('Reporte de gestión de empleo', 'Administración municipal', $periodo, $generado);

        $contenido .= $this->seccion('Resumen de gestión', $this->resumenAdministracion($indicadores), true);
        $contenido .= $this->seccion('Actividad de postulaciones', $this->tablaActividad($indicadores['actividad_mensual'] ?? []));
        $contenido .= $this->seccion('Ofertas por estado', $this->tablaConteo(
            self::ORDEN_OFERTAS,
            self::ETIQUETA_ESTADO_OFERTA,
            $indicadores['ofertas'] ?? [],
        ));
        $contenido .= $this->seccion('Postulaciones por estado', $this->tablaConteo(
            self::ORDEN_POSTULACIONES,
            self::ETIQUETA_ESTADO_POSTULACION,
            $indicadores['postulaciones'] ?? [],
        ));
        $contenido .= $this->seccion('Detalle de contrataciones', $this->tablaContrataciones($contrataciones));

        return $this->documento($contenido);
    }

    /**
     * Construye el documento de la empresa autenticada completo.
     *
     * @param array<string, mixed> $empresa
     * @param array<string, mixed> $indicadores
     * @param list<array<string, mixed>> $postulaciones
     * @param list<array<string, mixed>> $contrataciones
     * @param list<array<string, mixed>> $ofertas
     */
    public function construirHtmlEmpresa(
        array $empresa,
        array $indicadores,
        array $postulaciones,
        array $contrataciones,
        array $ofertas,
        ?string $desde,
        ?string $hasta,
    ): string {
        $razonSocial = (string) ($empresa['razon_social'] ?? 'Empresa');
        $ruc         = (string) ($empresa['ruc'] ?? '—');
        $periodo     = $this->periodo($desde, $hasta);
        $generado    = $this->generado();

        $contenido = $this->tituloBloque(
            'Reporte de actividad empresarial',
            'Empresa: ' . $razonSocial . ' · RUC: ' . $ruc,
            $periodo,
            $generado,
        );

        $contenido .= $this->seccion('Resumen de actividad', $this->resumenEmpresa($empresa, $indicadores), true);
        $contenido .= $this->seccion('Ofertas', $this->tablaOfertas($ofertas));
        $contenido .= $this->seccion('Postulaciones', $this->tablaPostulaciones($postulaciones));
        $contenido .= $this->seccion('Contrataciones', $this->tablaContratacionesEmpresa($contrataciones));

        return $this->documento($contenido);
    }

    /**
     * Renderiza el HTML con Dompdf y devuelve los bytes del PDF.
     *
     * @throws RuntimeException si Dompdf no produce un PDF válido
     */
    public function renderizar(string $html): string
    {
        $opciones = new Options();
        $opciones->set('isRemoteEnabled', false);
        $opciones->set('isHtml5ParserEnabled', true);
        $opciones->set('defaultFont', 'DejaVu Sans');
        $opciones->set('defaultPaperSize', 'A4');
        $opciones->set('dpi', 120);
        $opciones->set('chroot', rtrim(FCPATH, '/\\'));

        $dompdf = new Dompdf($opciones);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        // Dompdf no resuelve counter(pages) en el CSS; se numera con su API de
        // canvas para obtener "Página X de Y" en todas las páginas.
        $canvas      = $dompdf->getCanvas();
        $fontMetrics = $dompdf->getFontMetrics();
        $fuente      = $fontMetrics->getFont('DejaVu Sans', 'normal');
        $textoPagina = 'Página {PAGE_NUM} de {PAGE_COUNT}';
        $anchoTexto  = $fontMetrics->getTextWidth('Página 00 de 00', $fuente, 8);
        $canvas->page_text(
            $canvas->get_width() - 34 - $anchoTexto,
            $canvas->get_height() - 25,
            $textoPagina,
            $fuente,
            8,
            [0.36, 0.40, 0.44],
        );

        $bytes = $dompdf->output();
        if (! is_string($bytes) || $bytes === '' || ! str_starts_with($bytes, '%PDF-')) {
            throw new RuntimeException('No se pudo generar un PDF válido.');
        }

        return $bytes;
    }

    /**
     * @param array<string, mixed> $indicadores
     */
    private function resumenAdministracion(array $indicadores): string
    {
        $empresas      = $indicadores['empresas'] ?? ['total' => 0, 'activas' => 0];
        $ofertas       = $indicadores['ofertas'] ?? [];
        $postulaciones = $indicadores['postulaciones'] ?? [];

        $filas = [
            ['Empresas activas', $this->entero($empresas['activas'] ?? 0) . ' de ' . $this->entero($empresas['total'] ?? 0)],
            ['Empresas con procesos', $this->entero($indicadores['empresas_con_procesos'] ?? 0)],
            ['Postulantes activos', $this->entero($indicadores['postulantes_activos'] ?? 0)],
            ['Ofertas totales (acumulado)', $this->entero(array_sum($ofertas))],
            ['Postulaciones del periodo', $this->entero(array_sum($postulaciones))],
            ['Seleccionados del periodo', $this->entero($indicadores['seleccionados'] ?? 0)],
            ['Tasa de selección', $this->porcentaje($indicadores['tasa_seleccion'] ?? 0)],
            ['Contrataciones del periodo', $this->entero($indicadores['contrataciones'] ?? 0)],
            ['Tasa de contratación', $this->porcentaje($indicadores['tasa_contratacion'] ?? 0)],
            ['Tiempo promedio a revisión', $this->dias($indicadores['tiempo_promedio_revision_dias'] ?? null)],
            ['Tiempo promedio a selección', $this->dias($indicadores['tiempo_promedio_seleccion_dias'] ?? null)],
        ];

        return $this->tabla(['Indicador', 'Valor'], $filas, [1 => 'num'])
            . '<p class="nota">Los indicadores de empresas, postulantes y la distribución de ofertas por estado son acumulados/actuales y no se filtran por periodo, igual que en el reporte Excel. Postulaciones, selección, contrataciones y tiempos respetan el rango solicitado; la actividad mensual se calcula con el mismo criterio del dashboard y del reporte Excel.</p>';
    }

    /**
     * @param array<string, mixed> $empresa
     * @param array<string, mixed> $indicadores
     */
    private function resumenEmpresa(array $empresa, array $indicadores): string
    {
        $ofertas       = $indicadores['ofertas'] ?? [];
        $postulaciones = $indicadores['postulaciones'] ?? [];

        $identidad = [
            ['Razón social', (string) ($empresa['razon_social'] ?? '—')],
            ['RUC', (string) ($empresa['ruc'] ?? '—')],
        ];
        if (! empty($empresa['nombre_comercial'])) {
            $identidad[] = ['Nombre comercial', (string) $empresa['nombre_comercial']];
        }

        $metricas = [
            ['Ofertas publicadas', $this->entero($ofertas['publicada'] ?? 0)],
            ['Ofertas vencidas', $this->entero($ofertas['vencida'] ?? 0)],
            ['Ofertas en borrador', $this->entero($ofertas['borrador'] ?? 0)],
            ['Ofertas cerradas', $this->entero($ofertas['cerrada'] ?? 0)],
            ['Postulaciones recibidas (periodo)', $this->entero(array_sum($postulaciones))],
            ['Pendientes por revisar', $this->entero($postulaciones['pendiente'] ?? 0)],
            ['Seleccionados', $this->entero($postulaciones['seleccionado'] ?? 0)],
            ['No seleccionados', $this->entero($postulaciones['no_seleccionado'] ?? 0)],
        ];

        return '<h3 class="subtitulo">Identidad empresarial</h3>'
            . $this->tabla(['Dato', 'Valor'], $identidad, [1 => 'num'])
            . '<h3 class="subtitulo">Indicadores del periodo</h3>'
            . $this->tabla(['Indicador', 'Valor'], $metricas, [1 => 'num'])
            . '<p class="nota">Los conteos de ofertas por estado son actuales y no se filtran por periodo; las postulaciones y las contrataciones sí respetan el rango, igual que en el reporte Excel.</p>';
    }

    /**
     * @param list<array{mes?: string, etiqueta: string, total: int}> $actividad
     */
    private function tablaActividad(array $actividad): string
    {
        if ($actividad === []) {
            return $this->vacio();
        }

        $filas = [];
        foreach ($actividad as $item) {
            $filas[] = [(string) ($item['etiqueta'] ?? '—'), $this->entero($item['total'] ?? 0)];
        }
        $filas[] = ['Total', $this->entero(array_sum(array_map(static fn ($item) => (int) ($item['total'] ?? 0), $actividad)))];

        return $this->tabla(['Mes', 'Postulaciones'], $filas, [1 => 'num'], 'compacta', ['Total']);
    }

    /**
     * @param list<string> $orden
     * @param array<string, string> $etiquetas
     * @param array<string, int> $conteos
     */
    private function tablaConteo(array $orden, array $etiquetas, array $conteos): string
    {
        $filas = [];
        foreach ($orden as $clave) {
            $filas[] = [$etiquetas[$clave] ?? $clave, $this->entero($conteos[$clave] ?? 0)];
        }
        $filas[] = ['Total', $this->entero(array_sum(array_map(static fn ($fila) => (int) $fila[1], $filas)))];

        return $this->tabla(['Estado', 'Cantidad'], $filas, [1 => 'num'], 'compacta', ['Total']);
    }

    /**
     * @param list<array<string, mixed>> $contrataciones
     */
    private function tablaContrataciones(array $contrataciones): string
    {
        if ($contrataciones === []) {
            return $this->vacio();
        }

        $filas = [];
        foreach ($contrataciones as $contrato) {
            $filas[] = [
                $this->fecha($contrato['fecha_contratacion'] ?? null),
                (string) ($contrato['razon_social'] ?? '—'),
                (string) ($contrato['ruc'] ?? '—'),
                $this->nombreCompleto($contrato),
                (string) ($contrato['dni'] ?? '—'),
                (string) ($contrato['puesto'] ?? '—'),
                (string) ($contrato['cargo'] ?? '—'),
                (string) ($contrato['modalidad'] ?? '—'),
                $this->moneda($contrato['remuneracion'] ?? null),
            ];
        }

        return $this->tabla(
            ['Fecha', 'Empresa', 'RUC', 'Contratado', 'DNI', 'Oferta', 'Cargo', 'Modalidad', 'Remuneración'],
            $filas,
            [8 => 'num'],
            'compacta',
        );
    }

    /**
     * @param list<array<string, mixed>> $ofertas
     */
    private function tablaOfertas(array $ofertas): string
    {
        if ($ofertas === []) {
            return $this->vacio();
        }

        $filas = [];
        foreach ($ofertas as $oferta) {
            $estado = OfertaService::estadoEfectivo($oferta);
            $filas[] = [
                (string) ($oferta['puesto'] ?? '—'),
                self::ETIQUETA_ESTADO_OFERTA[$estado] ?? (string) $estado,
                $this->fecha($oferta['fecha_publicacion'] ?? null),
                $this->fecha($oferta['fecha_cierre'] ?? null),
                $this->entero($oferta['vacantes'] ?? 0),
                (string) ($oferta['ubicacion'] ?? '—'),
                $this->fecha($oferta['created_at'] ?? null),
            ];
        }

        return $this->tabla(
            ['Puesto', 'Estado', 'Publicación', 'Cierre', 'Vacantes', 'Ubicación', 'Creada'],
            $filas,
            [4 => 'num'],
            'compacta',
        );
    }

    /**
     * @param list<array<string, mixed>> $postulaciones
     */
    private function tablaPostulaciones(array $postulaciones): string
    {
        if ($postulaciones === []) {
            return $this->vacio();
        }

        $filas = [];
        foreach ($postulaciones as $postulacion) {
            $filas[] = [
                $this->fechaHora($postulacion['fecha_postulacion'] ?? null),
                (string) ($postulacion['puesto'] ?? '—'),
                (string) ($postulacion['ubicacion'] ?? '—'),
                $this->nombreCompleto($postulacion),
                (string) ($postulacion['dni'] ?? '—'),
                (string) ($postulacion['telefono'] ?? '—'),
                self::ETIQUETA_ESTADO_POSTULACION[$postulacion['estado'] ?? ''] ?? (string) ($postulacion['estado'] ?? '—'),
                ((int) ($postulacion['activo'] ?? 0)) === 1 ? 'Activa' : 'Retirada',
            ];
        }

        return $this->tabla(
            ['Fecha', 'Oferta', 'Ubicación', 'Postulante', 'DNI', 'Teléfono', 'Estado', 'Situación'],
            $filas,
            [],
            'compacta',
        );
    }

    /**
     * @param list<array<string, mixed>> $contrataciones
     */
    private function tablaContratacionesEmpresa(array $contrataciones): string
    {
        if ($contrataciones === []) {
            return $this->vacio();
        }

        $filas = [];
        foreach ($contrataciones as $contrato) {
            $filas[] = [
                $this->fecha($contrato['fecha_contratacion'] ?? null),
                (string) ($contrato['puesto'] ?? '—'),
                $this->nombreCompleto($contrato),
                (string) ($contrato['dni'] ?? '—'),
                (string) ($contrato['cargo'] ?? '—'),
                (string) ($contrato['modalidad'] ?? '—'),
                $this->moneda($contrato['remuneracion'] ?? null),
            ];
        }

        return $this->tabla(
            ['Fecha', 'Oferta', 'Contratado', 'DNI', 'Cargo', 'Modalidad', 'Remuneración'],
            $filas,
            [6 => 'num'],
            'compacta',
        );
    }

    /**
     * @param list<string> $encabezados
     * @param list<list<mixed>> $filas
     * @param array<int, string> $clases mapa índice de columna => clase CSS
     * @param list<string> $filasResaltadas etiquetas de la primera celda que se resaltan
     */
    private function tabla(array $encabezados, array $filas, array $clases = [], string $claseTabla = '', array $filasResaltadas = []): string
    {
        if ($filas === []) {
            return $this->vacio();
        }

        $html = '<table class="datos' . ($claseTabla !== '' ? ' ' . $claseTabla : '') . '"><thead><tr>';
        foreach ($encabezados as $indice => $encabezado) {
            $clase = $clases[$indice] ?? '';
            $html .= '<th' . ($clase !== '' ? ' class="' . $this->e($clase) . '"' : '') . '>' . $this->e($encabezado) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($filas as $numeroFila => $fila) {
            $resaltar = isset($fila[0]) && in_array((string) $fila[0], $filasResaltadas, true);
            $clasesFila = [];
            if ($numeroFila % 2 === 1) {
                $clasesFila[] = 'par';
            }
            if ($resaltar) {
                $clasesFila[] = 'total';
            }
            $html .= '<tr' . ($clasesFila !== [] ? ' class="' . implode(' ', $clasesFila) . '"' : '') . '>';
            foreach ($fila as $indice => $valor) {
                $clase = $clases[$indice] ?? '';
                $texto = trim((string) $valor) === '' ? '—' : (string) $valor;
                $html .= '<td' . ($clase !== '' ? ' class="' . $this->e($clase) . '"' : '') . '>' . $this->e($texto) . '</td>';
            }
            $html .= '</tr>';
        }

        return $html . '</tbody></table>';
    }

    private function seccion(string $titulo, string $contenido, bool $primera = false): string
    {
        return '<section class="seccion' . ($primera ? ' primera' : '') . '">'
            . '<h2>' . $this->e($titulo) . '</h2>'
            . $contenido
            . '</section>';
    }

    private function tituloBloque(string $titulo, string $ambito, string $periodo, string $generado): string
    {
        return '<div class="titulo-reporte">'
            . '<h1>' . $this->e($titulo) . '</h1>'
            . '<p class="ambito">' . $this->e($ambito) . '</p>'
            . '<table class="meta-tabla"><tr>'
            . '<td><strong>Periodo:</strong> ' . $this->e($periodo) . '</td>'
            . '<td><strong>Generado:</strong> ' . $this->e($generado) . '</td>'
            . '</tr></table>'
            . '</div>';
    }

    private function documento(string $contenido): string
    {
        $logo  = $this->logo();
        $alto  = 54;
        $ancho = round($alto * $logo['ancho'] / $logo['alto'], 1);

        $cabecera = '<header class="cabecera">'
            . '<table class="cabecera-tabla"><tr>'
            . '<td class="logo-cell"><img src="' . $logo['dataUri'] . '" alt="Escudo de la Municipalidad Distrital de José Leonardo Ortiz" style="width:' . $ancho . 'px;height:' . $alto . 'px;"></td>'
            . '<td class="identidad"><div class="institucion">Municipalidad Distrital de José Leonardo Ortiz</div><div class="sistema">Sistema de Empleo MDJLO</div></td>'
            . '<td class="sello"><div>Reporte institucional</div><div class="fecha">' . $this->fechaActual() . '</div></td>'
            . '</tr></table>'
            . '</header>';

        $pie = '<footer class="pie"><table class="pie-tabla"><tr>'
            . '<td>Sistema de Empleo MDJLO · Documento generado automáticamente</td>'
            . '<td class="pagina"></td>'
            . '</tr></table></footer>';

        return '<!doctype html><html lang="es"><head><meta charset="utf-8"><style>'
            . $this->css()
            . '</style></head><body>' . $cabecera . $pie . $contenido . '</body></html>';
    }

    /**
     * @return array{dataUri: string, ancho: int, alto: int}
     */
    private function logo(): array
    {
        $ruta = rtrim(FCPATH, '/\\') . DIRECTORY_SEPARATOR . 'sol-logo.png';
        if (! is_file($ruta) || ! is_readable($ruta)) {
            throw new RuntimeException('No se pudo cargar el escudo institucional para el PDF.');
        }

        $bytes = file_get_contents($ruta);
        if ($bytes === false || $bytes === '') {
            throw new RuntimeException('No se pudo leer el escudo institucional para el PDF.');
        }

        $dimensiones = @getimagesizefromstring($bytes);
        if ($dimensiones === false || $dimensiones[0] <= 0 || $dimensiones[1] <= 0) {
            throw new RuntimeException('El escudo institucional no es una imagen válida.');
        }

        return [
            'dataUri' => 'data:image/png;base64,' . base64_encode($bytes),
            'ancho'   => (int) $dimensiones[0],
            'alto'    => (int) $dimensiones[1],
        ];
    }

    private function css(): string
    {
        $azul       = self::AZUL;
        $azulOscuro = self::AZUL_OSCURO;
        $azulClaro  = self::AZUL_CLARO;
        $gris       = self::GRIS;
        $linea      = self::GRIS_LINEA;

        return <<<CSS
@page {
    size: A4 portrait;
    margin: 128px 34px 50px 34px;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    font-family: "DejaVu Sans", sans-serif;
    font-size: 9pt;
    line-height: 1.35;
    color: #1F2933;
}
header.cabecera {
    position: fixed;
    top: -108px;
    left: 0;
    right: 0;
    height: 92px;
    border-bottom: 2px solid {$azul};
    padding-bottom: 6px;
}
table.cabecera-tabla, table.pie-tabla, table.meta-tabla {
    width: 100%;
    border-collapse: collapse;
}
table.cabecera-tabla td { vertical-align: middle; }
td.logo-cell { width: 58px; padding: 0 10px 0 0; }
td.logo-cell img { display: block; }
td.identidad { text-align: left; }
.institucion { font-size: 10.5pt; font-weight: bold; color: {$azulOscuro}; }
.sistema { font-size: 8.5pt; color: {$gris}; margin-top: 2px; }
td.sello { text-align: right; font-size: 7.5pt; color: {$gris}; line-height: 1.4; }
td.sello .fecha { font-size: 8pt; color: {$azulOscuro}; }
footer.pie {
    position: fixed;
    bottom: -36px;
    left: 0;
    right: 0;
    height: 22px;
    border-top: 1px solid {$linea};
    padding-top: 5px;
    font-size: 7.5pt;
    color: {$gris};
}
footer.pie td:last-child { text-align: right; }
.titulo-reporte {
    margin: 0 0 18px 0;
    padding-bottom: 9px;
    border-bottom: 1px solid {$linea};
}
h1 {
    margin: 0 0 5px 0;
    font-size: 17pt;
    line-height: 1.2;
    color: {$azulOscuro};
}
.ambito {
    margin: 0 0 8px 0;
    font-size: 10pt;
    color: {$azul};
}
table.meta-tabla td {
    padding: 2px 10px 2px 0;
    font-size: 8.2pt;
    color: {$gris};
}
table.meta-tabla td:last-child { text-align: right; padding-right: 0; }
.seccion { page-break-before: always; }
.seccion.primera { page-break-before: avoid; }
h2 {
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid {$azul};
    font-size: 13pt;
    color: {$azulOscuro};
}
h3.subtitulo {
    margin: 12px 0 5px 0;
    font-size: 10pt;
    color: {$azul};
}
table.datos {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 12px 0;
}
table.datos th {
    background: {$azul};
    color: #FFFFFF;
    font-size: 8pt;
    font-weight: bold;
    text-align: left;
    padding: 5px 6px;
    border: 1px solid {$azul};
}
table.datos td {
    padding: 4px 6px;
    border-bottom: 1px solid {$linea};
    vertical-align: top;
    word-wrap: break-word;
}
table.datos tbody tr.par td { background: {$azulClaro}; }
table.datos tbody tr.total td {
    font-weight: bold;
    border-top: 1px solid {$azul};
    background: #FFFFFF;
}
table.datos.compacta th, table.datos.compacta td { font-size: 7.8pt; padding: 3px 4px; }
table.datos thead { display: table-header-group; }
table.datos tr { page-break-inside: avoid; }
.num { text-align: right; white-space: nowrap; }
.vacio {
    margin: 10px 0;
    padding: 8px 0;
    color: {$gris};
    font-style: italic;
}
.nota {
    margin: 8px 0 0 0;
    font-size: 7.8pt;
    color: {$gris};
}
CSS;
    }

    private function vacio(): string
    {
        return '<p class="vacio">Sin registros para el periodo seleccionado.</p>';
    }

    private function periodo(?string $desde, ?string $hasta): string
    {
        if ($desde !== null && $hasta !== null) {
            return 'Del ' . $this->fecha($desde) . ' al ' . $this->fecha($hasta);
        }
        if ($desde !== null) {
            return 'Desde el ' . $this->fecha($desde);
        }
        if ($hasta !== null) {
            return 'Hasta el ' . $this->fecha($hasta);
        }

        return 'Todo el historial';
    }

    private function generado(): string
    {
        $zona = (string) (config('App')->appTimezone ?? date_default_timezone_get());
        $ahora = new \DateTimeImmutable('now', new \DateTimeZone($zona));

        return $ahora->format('d/m/Y H:i') . ' (' . $zona . ')';
    }

    private function fechaActual(): string
    {
        $zona = (string) (config('App')->appTimezone ?? date_default_timezone_get());
        $ahora = new \DateTimeImmutable('now', new \DateTimeZone($zona));

        return $ahora->format('d/m/Y');
    }

    private function fecha(mixed $valor): string
    {
        if ($valor === null || $valor === '') {
            return '—';
        }
        $timestamp = strtotime((string) $valor);

        return $timestamp === false ? '—' : date('d/m/Y', $timestamp);
    }

    private function fechaHora(mixed $valor): string
    {
        if ($valor === null || $valor === '') {
            return '—';
        }
        $timestamp = strtotime((string) $valor);

        return $timestamp === false ? '—' : date('d/m/Y H:i', $timestamp);
    }

    private function entero(mixed $valor): string
    {
        return number_format((int) $valor, 0, '.', ',');
    }

    private function porcentaje(mixed $valor): string
    {
        return number_format((float) $valor, 1, '.', ',') . ' %';
    }

    private function dias(mixed $valor): string
    {
        return $valor === null ? 'Sin datos' : number_format((float) $valor, 1, '.', ',') . ' días';
    }

    private function moneda(mixed $valor): string
    {
        if ($valor === null || $valor === '' || ! is_numeric($valor)) {
            return '—';
        }

        return 'S/ ' . number_format((float) $valor, 2, '.', ',');
    }

    /**
     * @param array<string, mixed> $fila
     */
    private function nombreCompleto(array $fila): string
    {
        $nombre = trim((string) ($fila['nombres'] ?? '') . ' ' . (string) ($fila['apellidos'] ?? ''));

        return $nombre !== '' ? $nombre : '—';
    }

    private function e(mixed $valor): string
    {
        return htmlspecialchars((string) $valor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
