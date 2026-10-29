<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\ImageService;
use PHPUnit\Framework\TestCase;

/**
 * Comprueba el soporte WebP de la imagen PHP que ejecuta las pruebas (la misma
 * etapa `php-base` que usa producción) y el flujo real de ImageService.
 */
final class ImageWebpTest extends TestCase
{
    public function testGdIncluyeLecturaYEscrituraWebp(): void
    {
        $this->assertTrue(extension_loaded('gd'), 'La extensión GD no está instalada.');
        $this->assertTrue(function_exists('gd_info'), 'No está disponible gd_info().');

        $info = gd_info();
        $this->assertArrayHasKey('WebP Support', $info);
        $this->assertTrue($info['WebP Support'], 'GD no tiene soporte WebP.');
        $this->assertTrue(function_exists('imagecreatefromwebp'), 'Falta imagecreatefromwebp().');
        $this->assertTrue(function_exists('imagewebp'), 'Falta imagewebp().');
    }

    public function testGeneraYVuelveALeerUnWebpValido(): void
    {
        $origen = imagecreatetruecolor(12, 8);
        $this->assertNotFalse($origen);
        imagefill($origen, 0, 0, imagecolorallocate($origen, 32, 96, 160));

        ob_start();
        $ok = imagewebp($origen, null, 85);
        $bytes = (string) ob_get_clean();
        imagedestroy($origen);

        $this->assertTrue($ok);
        $this->assertNotSame('', $bytes);

        $info = getimagesizefromstring($bytes);
        $this->assertIsArray($info);
        $this->assertSame(IMAGETYPE_WEBP, $info[2]);
        $this->assertSame('image/webp', $info['mime']);

        $desdeMemoria = imagecreatefromstring($bytes);
        $this->assertNotFalse($desdeMemoria);
        $this->assertSame(12, imagesx($desdeMemoria));
        $this->assertSame(8, imagesy($desdeMemoria));
        imagedestroy($desdeMemoria);

        $ruta = tempnam(sys_get_temp_dir(), 'sol-webp-');
        $this->assertNotFalse($ruta);
        file_put_contents($ruta, $bytes);

        $desdeArchivo = imagecreatefromwebp($ruta);
        $this->assertNotFalse($desdeArchivo);
        $this->assertSame(12, imagesx($desdeArchivo));
        imagedestroy($desdeArchivo);
        unlink($ruta);
    }

    public function testImageServiceNormalizaYEmiteWebp(): void
    {
        $origen = imagecreatetruecolor(40, 30);
        imagefill($origen, 0, 0, imagecolorallocate($origen, 20, 110, 180));
        ob_start();
        imagewebp($origen, null, 85);
        $entrada = (string) ob_get_clean();
        imagedestroy($origen);

        $resultado = (new ImageService())->normalizar($entrada, 'cover', 'webp');

        $this->assertSame('image/webp', $resultado['mime']);
        $this->assertSame('webp', $resultado['extension']);
        $this->assertNotSame('', $resultado['bytes']);

        $info = getimagesizefromstring($resultado['bytes']);
        $this->assertIsArray($info);
        $this->assertSame(IMAGETYPE_WEBP, $info[2]);
        $this->assertSame(ImageService::SIZE, $info[0]);
        $this->assertSame(ImageService::SIZE, $info[1]);

        $imagen = imagecreatefromstring($resultado['bytes']);
        $this->assertNotFalse($imagen);
        imagedestroy($imagen);
    }

    public function testRechazaContenidoWebpInvalido(): void
    {
        $this->expectException(ApiException::class);

        (new ImageService())->normalizar(
            "RIFF\x10\x00\x00\x00WEBPcontenido-invalido",
            'cover',
            'webp',
        );
    }
}
