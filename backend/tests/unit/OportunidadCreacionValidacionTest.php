<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Services\AuditoriaService;
use App\Services\OportunidadService;
use PHPUnit\Framework\TestCase;

/**
 * Obligatoriedad exclusiva de la creación de oportunidades. La edición
 * conserva el contrato anterior (solo fuente/título obligatorios).
 */
final class OportunidadCreacionValidacionTest extends TestCase
{
    private function servicio(): OportunidadService
    {
        return new class (
            $this->createMock(OportunidadModel::class),
            $this->createMock(AuditoriaService::class),
        ) extends OportunidadService {
            public function validarCreacionPublica(array $datos): array
            {
                return $this->validar($datos, true);
            }

            public function validarEdicionPublica(array $datos): array
            {
                return $this->validar($datos, false);
            }
        };
    }

    private function datosValidos(): array
    {
        return [
            'fuente'            => 'empleos_peru',
            'titulo'            => 'Operarios para Lima',
            'enlace'            => 'https://empleosperu.gob.pe/oferta/1',
            'fecha_publicacion' => '2026-12-01',
            'descripcion'       => 'Convocatoria externa',
        ];
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function camposObligatorios(): array
    {
        return [
            'fuente'            => ['fuente', 'Selecciona una fuente válida.'],
            'titulo'            => ['titulo', 'El título de la oportunidad es obligatorio.'],
            'enlace'            => ['enlace', 'Introduce una URL válida.'],
            'fecha_publicacion' => ['fecha_publicacion', 'La fecha de publicación es obligatoria.'],
            'descripcion'       => ['descripcion', 'La descripción de la oportunidad es obligatoria.'],
        ];
    }

    /**
     * @dataProvider camposObligatorios
     */
    public function testCadaCampoEsObligatorioAlCrear(string $campo, string $mensaje): void
    {
        $datos = $this->datosValidos();
        $datos[$campo] = '';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException para ' . $campo);
        } catch (ApiException $e) {
            self::assertSame(422, $e->getHttpCode());
            self::assertSame($mensaje, $e->getCampos()[$campo] ?? null);
        }
    }

    public function testFuenteInvalida(): void
    {
        $datos = $this->datosValidos();
        $datos['fuente'] = 'fuente_desconocida';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('Selecciona una fuente válida.', $e->getCampos()['fuente'] ?? null);
        }
    }

    public function testTituloSoloEspacios(): void
    {
        $datos = $this->datosValidos();
        $datos['titulo'] = '    ';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('El título de la oportunidad es obligatorio.', $e->getCampos()['titulo'] ?? null);
        }
    }

    public function testUrlVaciaEInvalida(): void
    {
        foreach (['', 'no-es-url', 'javascript:alert(1)', 'data:text/html;base64,abc', 'ftp://example.com/x'] as $url) {
            $datos = $this->datosValidos();
            $datos['enlace'] = $url;

            try {
                $this->servicio()->validarCreacionPublica($datos);
                self::fail('Se esperaba ApiException para ' . $url);
            } catch (ApiException $e) {
                self::assertSame('Introduce una URL válida.', $e->getCampos()['enlace'] ?? null);
            }
        }
    }

    public function testFechaVaciaEInvalida(): void
    {
        foreach (['', '2026-13-01', '2026-02-31', '01/12/2026'] as $fecha) {
            $datos = $this->datosValidos();
            $datos['fecha_publicacion'] = $fecha;

            try {
                $this->servicio()->validarCreacionPublica($datos);
                self::fail('Se esperaba ApiException para ' . $fecha);
            } catch (ApiException $e) {
                $esperado = $fecha === ''
                    ? 'La fecha de publicación es obligatoria.'
                    : 'La fecha de publicación no es válida.';
                self::assertSame($esperado, $e->getCampos()['fecha_publicacion'] ?? null);
            }
        }
    }

    public function testDescripcionVaciaOConHtmlVacio(): void
    {
        foreach (['', '   ', '<p></p>', '<p><br></p>', "<div> \n </div>"] as $descripcion) {
            $datos = $this->datosValidos();
            $datos['descripcion'] = $descripcion;

            try {
                $this->servicio()->validarCreacionPublica($datos);
                self::fail('Se esperaba ApiException.');
            } catch (ApiException $e) {
                self::assertSame('La descripción de la oportunidad es obligatoria.', $e->getCampos()['descripcion'] ?? null);
            }
        }
    }

    public function testCreacionValidaNormalizaTituloYEnlace(): void
    {
        $datos = $this->datosValidos();
        $datos['titulo'] = '  Operarios   para Lima  ';
        $datos['enlace'] = '  https://example.com/convocatoria  ';

        $limpio = $this->servicio()->validarCreacionPublica($datos);

        self::assertSame('Operarios   para Lima', $limpio['titulo']);
        self::assertSame('https://example.com/convocatoria', $limpio['enlace']);
        self::assertSame('2026-12-01', $limpio['fecha_publicacion']);
        self::assertSame('Convocatoria externa', $limpio['descripcion']);
    }

    public function testEdicionConservaContratoAnterior(): void
    {
        $limpio = $this->servicio()->validarEdicionPublica([
            'fuente' => 'empleos_peru',
            'titulo' => 'Solo estos dos campos',
        ]);

        self::assertSame('empleos_peru', $limpio['fuente']);
        self::assertSame('Solo estos dos campos', $limpio['titulo']);
        self::assertNull($limpio['descripcion']);
        self::assertNull($limpio['enlace']);
        self::assertSame(date('Y-m-d'), $limpio['fecha_publicacion']);
    }
}
