<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\ReporteExcelService;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * El reporte Excel debe representar los siete estados de una oferta y usar el
 * estado efectivo para distinguir `vencida` de `publicada`. Estas pruebas
 * ejercitan las hojas sin base de datos; la integración con datos reales se
 * cubre en el smoke test aislado.
 */
final class ReporteExcelServiceTest extends TestCase
{
    private const ETIQUETAS = [
        'publicada'  => 'Publicada',
        'vencida'    => 'Vencida',
        'borrador'   => 'Borrador',
        'cerrada'    => 'Cerrada',
        'pendiente'  => 'Pendiente de revisión',
        'observada'  => 'Observada',
        'rechazada'  => 'Rechazada',
    ];

    public function testHojaOfertasPorEstadoIncluyeLasSieteCategoriasAunqueEstenEnCero(): void
    {
        $filas = $this->hojaConteo(array_fill_keys(array_keys(self::ETIQUETAS), 0))->toArray();

        $this->assertSame(['Estado', 'Cantidad'], $filas[0]);
        $this->assertCount(9, $filas, 'Debe haber encabezado, siete estados y Total.');

        $estados = [];
        foreach (array_slice($filas, 1, -1) as $fila) {
            $estados[$fila[0]] = (int) $fila[1];
        }

        $this->assertSame(array_values(self::ETIQUETAS), array_keys($estados));
        $this->assertSame(0, array_sum($estados));
        $this->assertSame('Total', $filas[8][0]);
        $this->assertSame('0', (string) $filas[8][1]);
    }

    public function testHojaOfertasPorEstadoCuentaCadaOfertaUnaSolaVez(): void
    {
        $conteos = [
            'publicada' => 1,
            'vencida'   => 2,
            'borrador'  => 3,
            'cerrada'   => 4,
            'pendiente' => 5,
            'observada' => 6,
            'rechazada' => 7,
        ];

        $filas = $this->hojaConteo($conteos)->toArray();
        $distribucion = [];
        foreach (array_slice($filas, 1, -1) as $fila) {
            $distribucion[$fila[0]] = (int) $fila[1];
        }

        $this->assertSame([
            'Publicada'             => 1,
            'Vencida'               => 2,
            'Borrador'              => 3,
            'Cerrada'               => 4,
            'Pendiente de revisión' => 5,
            'Observada'             => 6,
            'Rechazada'             => 7,
        ], $distribucion);
        $this->assertSame(28, array_sum($distribucion));
        $this->assertSame('Total', $filas[8][0]);
        $this->assertSame('28', (string) $filas[8][1]);
    }

    public function testHojaDeEmpresaTraduceLosSieteEstadosYUsaElEstadoEfectivo(): void
    {
        $ofertas = [
            ['puesto' => 'Borrador', 'estado' => 'borrador', 'fecha_cierre' => '2000-01-01'],
            ['puesto' => 'Pendiente', 'estado' => 'pendiente', 'fecha_cierre' => '2000-01-01'],
            ['puesto' => 'Publicada vigente', 'estado' => 'publicada', 'fecha_cierre' => '2999-12-31'],
            ['puesto' => 'Publicada vencida', 'estado' => 'publicada', 'fecha_cierre' => '2000-01-01'],
            ['puesto' => 'Publicada sin cierre', 'estado' => 'publicada', 'fecha_cierre' => null],
            ['puesto' => 'Cerrada', 'estado' => 'cerrada', 'fecha_cierre' => '2000-01-01'],
            ['puesto' => 'Observada', 'estado' => 'observada', 'fecha_cierre' => '2000-01-01'],
            ['puesto' => 'Rechazada', 'estado' => 'rechazada', 'fecha_cierre' => '2000-01-01'],
        ];

        $filas = $this->hojaOfertas($ofertas)->toArray();
        $this->assertSame(
            ['Puesto', 'Estado', 'Publicación', 'Cierre', 'Vacantes', 'Ubicación', 'Creada'],
            $filas[0]
        );

        $porPuesto = [];
        foreach (array_slice($filas, 1) as $fila) {
            $porPuesto[$fila[0]] = $fila[1];
        }

        $this->assertSame('Borrador', $porPuesto['Borrador']);
        $this->assertSame('Pendiente de revisión', $porPuesto['Pendiente']);
        $this->assertSame('Publicada', $porPuesto['Publicada vigente']);
        $this->assertSame('Vencida', $porPuesto['Publicada vencida']);
        $this->assertSame('Publicada', $porPuesto['Publicada sin cierre']);
        $this->assertSame('Cerrada', $porPuesto['Cerrada']);
        $this->assertSame('Observada', $porPuesto['Observada']);
        $this->assertSame('Rechazada', $porPuesto['Rechazada']);
    }

    /**
     * @param array<string, int> $conteos
     */
    private function hojaConteo(array $conteos): Worksheet
    {
        $hoja = (new Spreadsheet())->getActiveSheet();
        $metodo = new ReflectionMethod(ReporteExcelService::class, 'hojaConteo');
        $metodo->setAccessible(true);
        $metodo->invoke(
            new ReporteExcelService(),
            $hoja,
            $this->constante('ORDEN_OFERTAS'),
            $this->constante('ETIQUETA_ESTADO_OFERTA'),
            $conteos
        );

        return $hoja;
    }

    /**
     * @param list<array<string, mixed>> $ofertas
     */
    private function hojaOfertas(array $ofertas): Worksheet
    {
        $hoja = (new Spreadsheet())->getActiveSheet();
        $metodo = new ReflectionMethod(ReporteExcelService::class, 'hojaOfertasEmpresa');
        $metodo->setAccessible(true);
        $metodo->invoke(new ReporteExcelService(), $hoja, $ofertas);

        return $hoja;
    }

    private function constante(string $nombre): mixed
    {
        $constante = (new ReflectionClass(ReporteExcelService::class))->getReflectionConstant($nombre);
        $this->assertNotFalse($constante);

        return $constante->getValue();
    }
}
