<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\ActividadModel;
use App\Services\ActividadService;
use App\Services\HtmlSanitizer;
use App\Services\StorageService;
use CodeIgniter\HTTP\Files\UploadedFile;
use PHPUnit\Framework\TestCase;

/**
 * Reglas de obligatoriedad al crear/editar actividades. La validación se
 * prueba sin base de datos; la creación real y la sustitución de imagen se
 * cubren en el smoke test de actividades.
 */
final class ActividadValidacionTest extends TestCase
{
    private const VALIDA = [
        'tipo'         => 'taller',
        'nombre'       => 'Taller de empleabilidad',
        'descripcion'  => '<p>Contenido <strong>real</strong></p>',
        'fecha_inicio' => '2026-12-01 09:00:00',
        'fecha_fin'    => '2026-12-01 11:00:00',
        'lugar'        => 'Plaza Central',
        'modalidad'    => 'presencial',
        'organizador'  => 'MDJLO',
    ];

    private function servicio(): ActividadService
    {
        return new class (
            $this->createMock(ActividadModel::class),
            new HtmlSanitizer(),
            $this->createMock(StorageService::class),
        ) extends ActividadService {
            public function validarCampos(array $datos): array
            {
                return $this->validar($datos);
            }

            public function validarImagenPublica(UploadedFile $archivo): array
            {
                return $this->validarImagen($archivo);
            }

            public function exigirImagenPublica(?UploadedFile $archivo): array
            {
                return $this->exigirImagen($archivo);
            }
        };
    }

    private function archivo(string $contenido, string $nombre = 'actividad.jpg'): UploadedFile
    {
        $ruta = tempnam(sys_get_temp_dir(), 'sol-act-');
        self::assertNotFalse($ruta);
        file_put_contents($ruta, $contenido);

        return new class ($ruta, $nombre, 'image/jpeg', strlen($contenido), null) extends UploadedFile {
            public function isValid(): bool
            {
                return $this->getError() === UPLOAD_ERR_OK;
            }
        };
    }

    private function imagenJpeg(int $ancho = 640, int $alto = 360): UploadedFile
    {
        $ruta = tempnam(sys_get_temp_dir(), 'sol-img-');
        self::assertNotFalse($ruta);

        $imagen = imagecreatetruecolor($ancho, $alto);
        self::assertNotFalse($imagen);
        imagejpeg($imagen, $ruta, 85);
        imagedestroy($imagen);

        return new class ($ruta, 'actividad.jpg', 'image/jpeg', null, null) extends UploadedFile {
            public function isValid(): bool
            {
                return $this->getError() === UPLOAD_ERR_OK;
            }
        };
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function camposObligatorios(): array
    {
        return [
            'tipo'         => ['tipo', 'Selecciona el tipo de actividad.'],
            'nombre'       => ['nombre', 'El nombre de la actividad es obligatorio.'],
            'inicio'       => ['fecha_inicio', 'Indica la fecha y hora de inicio.'],
            'fin'          => ['fecha_fin', 'Indica la fecha y hora de finalización.'],
            'modalidad'    => ['modalidad', 'Selecciona una modalidad.'],
            'lugar'        => ['lugar', 'El lugar de realización es obligatorio.'],
            'organizador'  => ['organizador', 'Indica quién organiza la actividad.'],
            'descripcion'  => ['descripcion', 'La descripción de la actividad es obligatoria.'],
        ];
    }

    /**
     * @dataProvider camposObligatorios
     */
    public function testCadaCampoEsObligatorio(string $campo, string $mensaje): void
    {
        $datos = self::VALIDA;
        $datos[$campo] = '';

        try {
            $this->servicio()->validarCampos($datos);
            self::fail('Se esperaba ApiException para ' . $campo);
        } catch (ApiException $e) {
            self::assertSame(422, $e->getHttpCode());
            self::assertSame($mensaje, $e->getCampos()[$campo] ?? null);
        }
    }

    public function testTodosLosCamposVaciosDevuelveLosOchoErrores(): void
    {
        try {
            $this->servicio()->validarCampos([]);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(422, $e->getHttpCode());
            self::assertSame(
                ['tipo', 'nombre', 'fecha_inicio', 'fecha_fin', 'modalidad', 'lugar', 'organizador', 'descripcion'],
                array_keys($e->getCampos()),
            );
        }
    }

    public function testNombreSoloEspaciosSeRechazaYSeNormaliza(): void
    {
        try {
            $this->servicio()->validarCampos(['nombre' => '   '] + self::VALIDA);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('El nombre de la actividad es obligatorio.', $e->getCampos()['nombre'] ?? null);
        }

        $limpio = $this->servicio()->validarCampos(['nombre' => '  Taller   de   empleo  '] + self::VALIDA);
        self::assertSame('Taller de empleo', $limpio['nombre']);
    }

    public function testDescripcionHtmlVaciaSeRechazaYElHtmlLegitimoSeConserva(): void
    {
        foreach (['<p><br></p>', '<p>   </p>', '<ul><li></li></ul>', "\n\n", ['no', 'es', 'texto']] as $vacia) {
            try {
                $this->servicio()->validarCampos(['descripcion' => $vacia] + self::VALIDA);
                self::fail('Se esperaba ApiException para descripción vacía o no textual.');
            } catch (ApiException $e) {
                self::assertSame('La descripción de la actividad es obligatoria.', $e->getCampos()['descripcion'] ?? null);
            }
        }

        $limpio = $this->servicio()->validarCampos([
            'descripcion' => '<p>Hola <strong>mundo</strong> y <em>tildes: José</em></p>',
        ] + self::VALIDA);

        self::assertStringContainsString('<strong>mundo</strong>', $limpio['descripcion']);
        self::assertStringContainsString('<em>tildes: José</em>', $limpio['descripcion']);
    }

    public function testFechaFinAnteriorAlInicioSeRechaza(): void
    {
        try {
            $this->servicio()->validarCampos(['fecha_fin' => '2026-11-30 08:00:00'] + self::VALIDA);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(
                'La fecha de finalización no puede ser anterior a la fecha de inicio.',
                $e->getCampos()['fecha_fin'] ?? null,
            );
        }
    }

    public function testTipoYModalidadInvalidosSeRechazan(): void
    {
        try {
            $this->servicio()->validarCampos(['tipo' => 'concierto'] + self::VALIDA);
            self::fail('Se esperaba ApiException para tipo.');
        } catch (ApiException $e) {
            self::assertSame('Selecciona un tipo de actividad válido.', $e->getCampos()['tipo'] ?? null);
        }

        try {
            $this->servicio()->validarCampos(['modalidad' => 'hibrida'] + self::VALIDA);
            self::fail('Se esperaba ApiException para modalidad.');
        } catch (ApiException $e) {
            self::assertSame('Selecciona una modalidad válida.', $e->getCampos()['modalidad'] ?? null);
        }
    }

    public function testFechasInvalidasSeRechazan(): void
    {
        try {
            $this->servicio()->validarCampos(['fecha_inicio' => '2026-13-01 09:00'] + self::VALIDA);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('Indica una fecha y hora de inicio válidas.', $e->getCampos()['fecha_inicio'] ?? null);
        }
    }

    public function testCreacionSinImagenSeRechaza(): void
    {
        try {
            $this->servicio()->exigirImagenPublica(null);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('Debes subir una imagen para la actividad.', $e->getCampos()['imagen'] ?? null);
        }
    }

    public function testImagenValidaSeAceptaConExtensionCanonica(): void
    {
        $imagen = $this->servicio()->validarImagenPublica($this->imagenJpeg());

        self::assertSame('jpg', $imagen['extension']);
        self::assertSame('image/jpeg', $imagen['mime']);
        self::assertSame('image/jpeg', (new \finfo(FILEINFO_MIME_TYPE))->buffer($imagen['contenido']));
    }

    public function testImagenConContenidoInvalidoSeRechaza(): void
    {
        try {
            $this->servicio()->validarImagenPublica($this->archivo('esto no es una imagen'));
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertArrayHasKey('imagen', $e->getCampos());
        }
    }

    public function testImagenSuperiorADosMegasSeRechaza(): void
    {
        $contenido = str_repeat('a', (2 * 1024 * 1024) + 1);

        try {
            $this->servicio()->validarImagenPublica($this->archivo($contenido));
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame('La imagen supera el tamaño máximo de 2 MB.', $e->getCampos()['imagen'] ?? null);
        }
    }

    public function testImagenSuperiorALaResolucionMaximaSeRechaza(): void
    {
        try {
            $this->servicio()->validarImagenPublica($this->imagenJpeg(2000, 1000));
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(
                'La imagen supera la resolución máxima de 1920 × 1080 px.',
                $e->getCampos()['imagen'] ?? null,
            );
        }
    }

    public function testCreacionValidaCompleta(): void
    {
        $limpio = $this->servicio()->validarCampos(self::VALIDA);
        $imagen = $this->servicio()->validarImagenPublica($this->imagenJpeg());

        self::assertSame('taller', $limpio['tipo']);
        self::assertSame('2026-12-01 09:00:00', $limpio['fecha_inicio']);
        self::assertSame('2026-12-01 11:00:00', $limpio['fecha_fin']);
        self::assertSame('jpg', $imagen['extension']);
    }
}
