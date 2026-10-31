<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\StorageService;
use PHPUnit\Framework\TestCase;

/**
 * Endurecimiento de StorageService: claves de objeto, rutas canónicas dentro
 * de uploads y rechazo de traversal/enlaces simbólicos. Las pruebas usan un
 * directorio temporal propio; nunca tocan los archivos reales de uploads.
 */
final class StorageServiceTest extends TestCase
{
    private string $raiz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->raiz = sys_get_temp_dir() . '/sol-storage-' . bin2hex(random_bytes(6));
        self::assertTrue(mkdir($this->raiz, 0775, true));
    }

    protected function tearDown(): void
    {
        $this->borrar($this->raiz);
        $this->borrar($this->raiz . '-fuera');

        parent::tearDown();
    }

    private function servicio(): StorageService
    {
        $servicio = new class ($this->raiz) extends StorageService {
            public function __construct(private readonly string $raiz)
            {
                parent::__construct();
            }

            public function esSupabase(): bool
            {
                return false;
            }

            protected function raizLocal(): string
            {
                return $this->raiz;
            }

            public function rutaObjetoPublica(string $objectKey): string
            {
                return $this->rutaObjeto($objectKey);
            }
        };

        // Bucket determinista aunque el entorno tenga configuración real.
        $propiedad = new \ReflectionProperty(StorageService::class, 'bucket');
        $propiedad->setValue($servicio, 'cvs');

        return $servicio;
    }

    private function borrar(string $ruta): void
    {
        if (is_link($ruta) || is_file($ruta)) {
            @unlink($ruta);

            return;
        }
        if (! is_dir($ruta)) {
            return;
        }
        foreach (scandir($ruta) ?: [] as $entrada) {
            if ($entrada === '.' || $entrada === '..') {
                continue;
            }
            $this->borrar($ruta . DIRECTORY_SEPARATOR . $entrada);
        }
        @rmdir($ruta);
    }

    public function testAceptaClavesGeneradasPorElServidor(): void
    {
        $claves = [
            'postulante-1/5714477fc1d9643f.pdf',
            'postulante-42/abc.docx',
            'postulantes/foto/1/15ed19b2dbbaf39b.jpg',
            'empresas/logo/7/aa11bb22cc33dd44.png',
            'actividades/3/0123456789abcdef.webp',
        ];

        foreach ($claves as $clave) {
            self::assertTrue(StorageService::claveValida($clave), 'Clave rechazada: ' . $clave);
        }
    }

    /**
     * @return array<string, array{string}>
     */
    public static function clavesPeligrosas(): array
    {
        return [
            'vacía'              => [''],
            'traversal'          => ['postulante-1/../../etc/passwd'],
            'traversal simple'   => ['../postulante-1/x.pdf'],
            'absoluta'           => ['/etc/passwd'],
            'windows'            => ['postulante-1\\..\\x.pdf'],
            'unidad windows'     => ['C:/Windows/x.pdf'],
            'nul'                => ["postulante-1/x\0.pdf"],
            'control'            => ["postulante-1/x\x01.pdf"],
            'doble barra'        => ['postulante-1//x.pdf'],
            'segmento punto'     => ['postulante-1/./x.pdf'],
            'punto inicial'      => ['postulante-1/.oculto.pdf'],
            'punto final'        => ['postulante-1/x.pdf.'],
            'prefijo ajeno'      => ['otros/1/x.pdf'],
            'sin prefijo'        => ['x.pdf'],
            'url'                => ['https://evil.example/x.pdf'],
            'codificado'         => ['postulante-1/%2e%2e/x.pdf'],
            'id cero'            => ['postulante-0/x.pdf'],
            'demasiado larga'    => ['postulante-1/' . str_repeat('a', 300) . '.pdf'],
        ];
    }

    /**
     * @dataProvider clavesPeligrosas
     */
    public function testRechazaClavesPeligrosas(string $clave): void
    {
        self::assertFalse(StorageService::claveValida($clave));
        self::assertNull($this->servicio()->rutaLocal($clave));
    }

    public function testRutaLocalPermaneceDentroDeLaRaiz(): void
    {
        $directorio = $this->raiz . '/postulante-1';
        self::assertTrue(mkdir($directorio, 0775, true));
        $archivo = $directorio . '/5714477fc1d9643f.pdf';
        file_put_contents($archivo, '%PDF-1.4');

        $ruta = $this->servicio()->rutaLocal('postulante-1/5714477fc1d9643f.pdf');

        self::assertNotNull($ruta);
        self::assertSame(realpath($archivo), $ruta);
        self::assertStringStartsWith(realpath($this->raiz) . '/', $ruta);
    }

    public function testRechazaEnlaceSimbolicoQueEscapaDeLaRaiz(): void
    {
        $fuera = $this->raiz . '-fuera';
        if (! @mkdir($fuera, 0775, true) && ! is_dir($fuera)) {
            self::markTestSkipped('No se pudo crear el directorio externo.');
        }
        file_put_contents($fuera . '/secreto.pdf', 'contenido ajeno');
        @mkdir($this->raiz . '/postulante-1', 0775, true);

        if (! @symlink($fuera . '/secreto.pdf', $this->raiz . '/postulante-1/enlace.pdf')) {
            self::markTestSkipped('El sistema no permite crear enlaces simbólicos.');
        }

        self::assertNull($this->servicio()->rutaLocal('postulante-1/enlace.pdf'));
    }

    public function testRechazaDirectorioEnlazadoFueraDeLaRaiz(): void
    {
        $fuera = $this->raiz . '-fuera';
        if (! @mkdir($fuera, 0775, true) && ! is_dir($fuera)) {
            self::markTestSkipped('No se pudo crear el directorio externo.');
        }
        file_put_contents($fuera . '/x.pdf', 'contenido ajeno');

        if (! @symlink($fuera, $this->raiz . '/postulante-9')) {
            self::markTestSkipped('El sistema no permite crear enlaces simbólicos.');
        }

        self::assertNull($this->servicio()->rutaLocal('postulante-9/x.pdf'));
    }

    public function testAlmacenarContenidoEscribeSoloDentroDeLaRaiz(): void
    {
        $servicio = $this->servicio();
        $servicio->almacenarContenido('empresas/logo/1/aa11bb22cc33dd44.png', 'PNG', 'image/png');

        $archivo = $this->raiz . '/empresas/logo/1/aa11bb22cc33dd44.png';
        self::assertFileExists($archivo);
        self::assertSame('PNG', file_get_contents($archivo));
        self::assertSame('PNG', $servicio->obtenerContenido('empresas/logo/1/aa11bb22cc33dd44.png'));

        $servicio->eliminar('empresas/logo/1/aa11bb22cc33dd44.png');
        self::assertFileDoesNotExist($archivo);
        self::assertNull($servicio->obtenerContenido('empresas/logo/1/aa11bb22cc33dd44.png'));
    }

    public function testEscrituraConTraversalSeRechazaYNoTocaArchivosExternos(): void
    {
        $centinela = $this->raiz . '-fuera';
        @mkdir($centinela, 0775, true);
        file_put_contents($centinela . '/x.pdf', 'original');

        try {
            $this->servicio()->almacenarContenido('postulante-1/../../x.pdf', 'malicioso', 'application/pdf');
            self::fail('Se esperaba ApiException.');
        } catch (ApiException) {
            self::assertSame('original', file_get_contents($centinela . '/x.pdf'));
        }

        try {
            $this->servicio()->eliminar('postulante-1/../../x.pdf');
            self::fail('Se esperaba ApiException.');
        } catch (ApiException) {
            self::assertSame('original', file_get_contents($centinela . '/x.pdf'));
        }
    }

    public function testRutaObjetoNoPermiteAlterarBucketNiEndpoint(): void
    {
        $servicio = $this->servicio();

        self::assertSame(
            '/storage/v1/s3/cvs/empresas/logo/1/aa11bb22cc33dd44.png',
            $servicio->rutaObjetoPublica('empresas/logo/1/aa11bb22cc33dd44.png'),
        );

        $this->expectException(ApiException::class);
        $servicio->rutaObjetoPublica('empresas/logo/1/../../otro-bucket/x.png');
    }

    public function testUrlTemporalLocalUsaLaRutaAutorizada(): void
    {
        $url = $this->servicio()->urlTemporal('postulante-1/5714477fc1d9643f.pdf');

        self::assertStringContainsString('/api/postulante/cv/archivo/', $url);
        $clave = substr($url, strrpos($url, '/') + 1);
        self::assertSame('postulante-1/5714477fc1d9643f.pdf', base64_decode(strtr($clave, '-_', '+/'), true));
    }

    public function testUrlTemporalRechazaClavesInvalidas(): void
    {
        $this->expectException(ApiException::class);
        $this->servicio()->urlTemporal('/etc/passwd');
    }
}
