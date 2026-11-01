<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Services\HtmlSanitizer;
use App\Services\OportunidadService;
use PHPUnit\Framework\TestCase;

/**
 * Validación de oportunidades: creación completa y edición compatible con
 * registros históricos. Los campos de programación son obligatorios al crear y
 * al completar la programación; un registro heredado puede editarse sin
 * inventar fechas.
 */
final class OportunidadCreacionValidacionTest extends TestCase
{
    private function servicio(): OportunidadService
    {
        return new class (
            $this->createMock(OportunidadModel::class),
            new HtmlSanitizer(),
        ) extends OportunidadService {
            public function validarCreacionPublica(array $datos): array
            {
                return $this->validar($datos, true);
            }

            public function validarEdicionPublica(array $datos, array $existe, array $entrada): array
            {
                return $this->validar(array_merge($existe, $entrada), false, $existe, $entrada);
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
            'fecha_inicio'      => '2026-12-05 09:00',
            'fecha_fin'         => '2026-12-20 18:00',
            'modalidad'         => 'presencial',
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
            'fecha_inicio'      => ['fecha_inicio', 'Indica la fecha y hora de inicio.'],
            'fecha_fin'         => ['fecha_fin', 'Indica la fecha y hora de finalización.'],
            'modalidad'         => ['modalidad', 'Selecciona una modalidad.'],
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
        foreach (['', 'no-es-url', 'javascript:alert(1)', 'data:text/html;base64,abc', 'file:///tmp/x', 'ftp://example.com/x'] as $url) {
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

    public function testFechaPublicacionVaciaEInvalida(): void
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

    public function testFechasDeProgramacionCalendáricasYConHora(): void
    {
        foreach (['', '2026-12-05', '2026-13-05 09:00', '2026-02-31 09:00', '05/12/2026 09:00', '2026-12-05 25:00'] as $inicio) {
            $datos = $this->datosValidos();
            $datos['fecha_inicio'] = $inicio;

            try {
                $this->servicio()->validarCreacionPublica($datos);
                self::fail('Se esperaba ApiException para ' . $inicio);
            } catch (ApiException $e) {
                $esperado = $inicio === ''
                    ? 'Indica la fecha y hora de inicio.'
                    : 'Indica una fecha y hora de inicio válidas.';
                self::assertSame($esperado, $e->getCampos()['fecha_inicio'] ?? null);
            }
        }
    }

    public function testFinAnteriorAlInicioSeRechazaYLaIgualdadSeAcepta(): void
    {
        $datos = $this->datosValidos();
        $datos['fecha_inicio'] = '2026-12-20 18:00';
        $datos['fecha_fin']    = '2026-12-20 17:59';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(
                'La fecha de finalización no puede ser anterior a la fecha de inicio.',
                $e->getCampos()['fecha_fin'] ?? null,
            );
        }

        $iguales = $this->datosValidos();
        $iguales['fecha_inicio'] = '2026-12-20 18:00';
        $iguales['fecha_fin']    = '2026-12-20 18:00';

        $limpio = $this->servicio()->validarCreacionPublica($iguales);
        self::assertSame('2026-12-20 18:00:00', $limpio['fecha_inicio']);
        self::assertSame('2026-12-20 18:00:00', $limpio['fecha_fin']);
    }

    public function testModalidadSoloAceptaLosTresValoresCanonicos(): void
    {
        foreach (['presencial', 'virtual', 'mixta'] as $modalidad) {
            $datos = $this->datosValidos();
            $datos['modalidad'] = $modalidad;
            $limpio = $this->servicio()->validarCreacionPublica($datos);
            self::assertSame($modalidad, $limpio['modalidad']);
        }

        $datos = $this->datosValidos();
        $datos['modalidad'] = 'semipresencial';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('Selecciona una modalidad válida.', $e->getCampos()['modalidad'] ?? null);
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
                self::assertSame(
                    'La descripción de la oportunidad es obligatoria.',
                    $e->getCampos()['descripcion'] ?? null,
                );
            }
        }
    }

    public function testDescripcionSeSaneaYConservaEnlacesHttp(): void
    {
        $datos = $this->datosValidos();
        $datos['descripcion'] = '<p onclick="x()">Texto <strong>seguro</strong> '
            . '<a href="https://example.com">https://example.com</a></p>'
            . '<script>alert(1)</script><p><a href="javascript:alert(1)">malo</a></p>';

        $limpio = $this->servicio()->validarCreacionPublica($datos);

        self::assertStringNotContainsString('script', (string) $limpio['descripcion']);
        self::assertStringNotContainsString('onclick', (string) $limpio['descripcion']);
        self::assertStringNotContainsString('javascript', (string) $limpio['descripcion']);
        self::assertStringContainsString('<strong>seguro</strong>', (string) $limpio['descripcion']);
        self::assertStringContainsString('href="https://example.com"', (string) $limpio['descripcion']);
        self::assertStringContainsString('rel="noopener noreferrer"', (string) $limpio['descripcion']);
    }

    public function testLimiteDeDescripcionSeMideSobreTextoVisible(): void
    {
        $datos = $this->datosValidos();
        $datos['descripcion'] = '<p>' . str_repeat('a', 10000) . '</p>';
        $limpio = $this->servicio()->validarCreacionPublica($datos);
        self::assertSame(10000, mb_strlen(strip_tags((string) $limpio['descripcion'])));

        $datos['descripcion'] = '<p>' . str_repeat('a', 10001) . '</p>';

        try {
            $this->servicio()->validarCreacionPublica($datos);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(
                'La descripción de la oportunidad no debe superar 10.000 caracteres de texto.',
                $e->getCampos()['descripcion'] ?? null,
            );
        }
    }

    public function testCreacionValidaNormalizaTituloEnlaceYFechas(): void
    {
        $datos = $this->datosValidos();
        $datos['titulo']       = '  Operarios   para Lima  ';
        $datos['enlace']       = '  https://example.com/convocatoria  ';
        $datos['fecha_inicio'] = '2026-12-05T09:30';
        $datos['fecha_fin']    = '2026-12-20 18:00:45';

        $limpio = $this->servicio()->validarCreacionPublica($datos);

        self::assertSame('Operarios   para Lima', $limpio['titulo']);
        self::assertSame('https://example.com/convocatoria', $limpio['enlace']);
        self::assertSame('2026-12-01', $limpio['fecha_publicacion']);
        self::assertSame('2026-12-05 09:30:00', $limpio['fecha_inicio']);
        self::assertSame('2026-12-20 18:00:45', $limpio['fecha_fin']);
        self::assertSame('presencial', $limpio['modalidad']);
        self::assertSame('Convocatoria externa', $limpio['descripcion']);
    }

    public function testEdicionParcialConservaCamposYNoInventaProgramacion(): void
    {
        $existente = [
            'id'          => 7,
            'fuente'      => 'empleos_peru',
            'titulo'      => 'Título anterior',
            'descripcion' => '<p>Descripción anterior</p>',
            'enlace'      => 'https://example.com/anterior',
            'fecha_publicacion' => '2026-11-01',
            'fecha_inicio' => null,
            'fecha_fin'    => null,
            'modalidad'    => null,
            'estado'       => 'programado',
            'activo'       => 1,
        ];

        $limpio = $this->servicio()->validarEdicionPublica(
            [],
            $existente,
            ['fuente' => 'mype_local', 'titulo' => 'Título editado'],
        );

        self::assertSame('mype_local', $limpio['fuente']);
        self::assertSame('Título editado', $limpio['titulo']);
        self::assertArrayNotHasKey('descripcion', $limpio);
        self::assertArrayNotHasKey('enlace', $limpio);
        self::assertArrayNotHasKey('fecha_publicacion', $limpio);
        self::assertArrayNotHasKey('fecha_inicio', $limpio);
        self::assertArrayNotHasKey('fecha_fin', $limpio);
        self::assertArrayNotHasKey('modalidad', $limpio);
    }

    public function testEdicionQueCompletaProgramacionExigeLosTresCampos(): void
    {
        $existente = [
            'fuente' => 'empleos_peru', 'titulo' => 'Título', 'fecha_inicio' => null,
            'fecha_fin' => null, 'modalidad' => null,
        ];

        try {
            $this->servicio()->validarEdicionPublica(
                [],
                $existente,
                ['fecha_inicio' => '2026-12-05 09:00'],
            );
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertArrayHasKey('fecha_fin', $e->getCampos());
            self::assertArrayHasKey('modalidad', $e->getCampos());
        }

        $limpio = $this->servicio()->validarEdicionPublica(
            [],
            $existente,
            [
                'fecha_inicio' => '2026-12-05 09:00',
                'fecha_fin'    => '2026-12-06 18:00',
                'modalidad'    => 'virtual',
            ],
        );

        self::assertSame('2026-12-05 09:00:00', $limpio['fecha_inicio']);
        self::assertSame('2026-12-06 18:00:00', $limpio['fecha_fin']);
        self::assertSame('virtual', $limpio['modalidad']);
    }
}
