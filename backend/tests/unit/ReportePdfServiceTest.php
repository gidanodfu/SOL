<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\ReportePdfService;
use PHPUnit\Framework\TestCase;

/**
 * El PDF institucional debe reutilizar la identidad, el periodo, las siete
 * categorías de oferta y las secciones del reporte Excel. Las pruebas de
 * renderizado comprueban bytes PDF reales y que el logo maestro esté embebido.
 */
final class ReportePdfServiceTest extends TestCase
{
    private const HASH_LOGO = 'db7638707560fbc046f397e33cfd90cb8790506b802504c3f537081c48f3cd76';

    public function testDocumentoAdministrativoIncluyeIdentidadPeriodoYSecciones(): void
    {
        $servicio = new ReportePdfService();
        $html = $servicio->construirHtmlAdministracion($this->indicadores(), [], '2026-10-01', '2026-10-28');

        $this->assertStringContainsString('Municipalidad Distrital de José Leonardo Ortiz', $html);
        $this->assertStringContainsString('Sistema de Empleo MDJLO', $html);
        $this->assertStringContainsString('Reporte de gestión de empleo', $html);
        $this->assertStringContainsString('Administración municipal', $html);
        $this->assertStringContainsString('Del 01/10/2026 al 28/10/2026', $html);
        $this->assertStringContainsString('Resumen de gestión', $html);
        $this->assertStringContainsString('Actividad de postulaciones', $html);
        $this->assertStringContainsString('Ofertas por estado', $html);
        $this->assertStringContainsString('Postulaciones por estado', $html);
        $this->assertStringContainsString('Detalle de contrataciones', $html);
        $this->assertStringContainsString('Sin registros para el periodo seleccionado.', $html);
        $this->assertStringContainsString('position: fixed', $html);
        $this->assertStringContainsString('page-break-before: always', $html);
        $this->assertSame(1, substr_count($html, 'data:image/png;base64,'), 'El logo debe embeberse una vez y repetirse por CSS.');

        foreach (['Publicada', 'Vencida', 'Borrador', 'Cerrada', 'Pendiente de revisión', 'Observada', 'Rechazada'] as $etiqueta) {
            $this->assertStringContainsString($etiqueta, $html);
        }
    }

    public function testDocumentoEmpresaSeLimitaALaEmpresaYTraduceEstados(): void
    {
        $servicio = new ReportePdfService();
        $html = $servicio->construirHtmlEmpresa(
            $this->empresa(),
            $this->indicadores(),
            $this->postulaciones(),
            $this->contrataciones(),
            $this->ofertas(),
            '2026-10-01',
            '2026-10-28',
        );

        $this->assertStringContainsString('Empresa: Empresa A SAC · RUC: 20601234567', $html);
        $this->assertStringContainsString('Reporte de actividad empresarial', $html);
        $this->assertStringContainsString('Resumen de actividad', $html);
        $this->assertStringContainsString('Ofertas', $html);
        $this->assertStringContainsString('Postulaciones', $html);
        $this->assertStringContainsString('Contrataciones', $html);
        $this->assertStringContainsString('Vencida', $html);
        $this->assertStringContainsString('Pendiente de revisión', $html);
        $this->assertStringNotContainsString('Empresa B SAC', $html);
    }

    public function testRenderizaUnPdfValidoConElLogoEmbebido(): void
    {
        $servicio = new ReportePdfService();
        $html = $servicio->construirHtmlAdministracion($this->indicadores(), $this->contrataciones(), null, null);

        $pdf = $servicio->renderizar($html);

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertGreaterThan(10_000, strlen($pdf));
        $this->assertMatchesRegularExpression('/\/Subtype\s*\/Image/', $pdf);
        $this->assertGreaterThanOrEqual(5, preg_match_all('/\/Type\s*\/Page\b/', $pdf));
    }

    public function testTablaExtensaSeDivideEnVariasPaginasSinPerderElEncabezado(): void
    {
        $contrataciones = [];
        for ($i = 1; $i <= 80; ++$i) {
            $contrataciones[] = [
                'fecha_contratacion' => '2026-10-' . str_pad((string) (($i % 28) + 1), 2, '0', STR_PAD_LEFT),
                'razon_social' => 'Empresa ' . $i,
                'ruc' => '206000000' . $i,
                'nombres' => 'Nombre',
                'apellidos' => 'Apellido ' . $i,
                'dni' => '1234567' . $i,
                'puesto' => 'Puesto de prueba con texto suficientemente largo para ajustar',
                'cargo' => 'Cargo ' . $i,
                'modalidad' => 'Presencial',
                'remuneracion' => 1500.50,
            ];
        }

        $servicio = new ReportePdfService();
        $html = $servicio->construirHtmlAdministracion($this->indicadores(), $contrataciones, null, null);
        $pdf  = $servicio->renderizar($html);

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertGreaterThan(5, preg_match_all('/\/Type\s*\/Page\b/', $pdf));
        $this->assertStringContainsString('Contratado', $html);
    }

    public function testLogoDelBackendCoincideConElHashDelMaestroInstitucional(): void
    {
        $ruta = FCPATH . 'sol-logo.png';
        $this->assertFileExists($ruta);
        $this->assertSame(self::HASH_LOGO, hash_file('sha256', $ruta));
    }

    /**
     * @return array<string, mixed>
     */
    private function indicadores(): array
    {
        return [
            'empresas' => ['total' => 10, 'activas' => 7],
            'postulantes_activos' => 12,
            'ofertas' => [
                'borrador' => 1,
                'pendiente' => 2,
                'publicada' => 3,
                'vencida' => 4,
                'cerrada' => 5,
                'observada' => 6,
                'rechazada' => 7,
            ],
            'postulaciones' => [
                'pendiente' => 2,
                'en_revision' => 1,
                'seleccionado' => 3,
                'no_seleccionado' => 4,
            ],
            'contrataciones' => 2,
            'empresas_con_procesos' => 5,
            'seleccionados' => 3,
            'tasa_seleccion' => 30.0,
            'tasa_contratacion' => 66.7,
            'tiempo_promedio_revision_dias' => 2.5,
            'tiempo_promedio_seleccion_dias' => null,
            'actividad_mensual' => [
                ['mes' => '2026-09', 'etiqueta' => 'Sep', 'total' => 4],
                ['mes' => '2026-10', 'etiqueta' => 'Oct', 'total' => 6],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function empresa(): array
    {
        return [
            'id' => 2,
            'razon_social' => 'Empresa A SAC',
            'ruc' => '20601234567',
            'nombre_comercial' => 'Empresa A',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function postulaciones(): array
    {
        return [[
            'id' => 1,
            'fecha_postulacion' => '2026-10-15 10:30:00',
            'puesto' => 'Analista',
            'ubicacion' => 'José Leonardo Ortiz',
            'nombres' => 'Ana',
            'apellidos' => 'Pérez',
            'dni' => '12345678',
            'telefono' => '999888777',
            'estado' => 'pendiente',
            'activo' => 1,
        ]];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function contrataciones(): array
    {
        return [[
            'fecha_contratacion' => '2026-10-20',
            'razon_social' => 'Empresa A SAC',
            'ruc' => '20601234567',
            'nombres' => 'Ana',
            'apellidos' => 'Pérez',
            'dni' => '12345678',
            'puesto' => 'Analista',
            'cargo' => 'Analista de sistemas',
            'modalidad' => 'Presencial',
            'remuneracion' => 2500.00,
        ]];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function ofertas(): array
    {
        return [
            [
                'puesto' => 'Oferta vigente',
                'estado' => 'publicada',
                'fecha_publicacion' => '2026-10-01',
                'fecha_cierre' => '2026-12-31',
                'vacantes' => 2,
                'ubicacion' => 'José Leonardo Ortiz',
                'created_at' => '2026-10-01 09:00:00',
            ],
            [
                'puesto' => 'Oferta vencida',
                'estado' => 'publicada',
                'fecha_publicacion' => '2026-09-01',
                'fecha_cierre' => '2026-09-30',
                'vacantes' => 1,
                'ubicacion' => 'José Leonardo Ortiz',
                'created_at' => '2026-09-01 09:00:00',
            ],
            [
                'puesto' => 'Oferta pendiente',
                'estado' => 'pendiente',
                'fecha_publicacion' => null,
                'fecha_cierre' => '2026-12-31',
                'vacantes' => 1,
                'ubicacion' => 'José Leonardo Ortiz',
                'created_at' => '2026-10-02 09:00:00',
            ],
        ];
    }
}
