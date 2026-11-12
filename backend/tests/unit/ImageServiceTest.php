<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\ImageService;
use PHPUnit\Framework\TestCase;

/**
 * Contrato de normalización de los tres flujos de imagen: logo contain PNG,
 * fotografía cover JPEG y rechazo de contenido que no es una imagen real.
 */
final class ImageServiceTest extends TestCase
{
    public function testLogoContainProducePngDe800x800(): void
    {
        $origen = imagecreatetruecolor(40, 20);
        imagefill($origen, 0, 0, imagecolorallocate($origen, 30, 120, 200));
        ob_start();
        imagepng($origen);
        $entrada = (string) ob_get_clean();
        imagedestroy($origen);

        $resultado = (new ImageService())->normalizar($entrada, 'contain', 'png');

        $this->assertSame('image/png', $resultado['mime']);
        $this->assertSame('png', $resultado['extension']);
        $info = getimagesizefromstring($resultado['bytes']);
        $this->assertIsArray($info);
        $this->assertSame(ImageService::SIZE, $info[0]);
        $this->assertSame(ImageService::SIZE, $info[1]);
    }

    public function testFotografiaCoverProduceJpegDe800x800(): void
    {
        $origen = imagecreatetruecolor(60, 30);
        imagefill($origen, 0, 0, imagecolorallocate($origen, 200, 80, 30));
        ob_start();
        imagejpeg($origen, null, 85);
        $entrada = (string) ob_get_clean();
        imagedestroy($origen);

        $resultado = (new ImageService())->normalizar($entrada, 'cover', 'jpeg');

        $this->assertSame('image/jpeg', $resultado['mime']);
        $this->assertSame('jpg', $resultado['extension']);
        $info = getimagesizefromstring($resultado['bytes']);
        $this->assertIsArray($info);
        $this->assertSame(ImageService::SIZE, $info[0]);
        $this->assertSame(ImageService::SIZE, $info[1]);
    }

    public function testRechazaContenidoQueNoEsImagen(): void
    {
        $this->expectException(ApiException::class);
        (new ImageService())->normalizar('no es una imagen', 'contain', 'png');
    }
}
