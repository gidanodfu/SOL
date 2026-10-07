<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use CodeIgniter\HTTP\Files\UploadedFile;

/**
 * Normalización de imágenes a un cuadrado de 800x800 sin deformar, usando GD
 * (extensión ya disponible; no se agregan dependencias). Dos modos:
 *   - contain: la imagen completa cabe dentro del cuadrado (fondo blanco). Para
 *     logos, de modo que no se recorte texto.
 *   - cover: la imagen llena el cuadrado recortando centrado. Para fotografías.
 *
 * La validación se hace sobre el contenido real (getimagesizefromstring), nunca
 * sobre el nombre o el content-type enviados por el cliente. No acepta SVG ni
 * formatos no rasterizados.
 */
class ImageService
{
    public const SIZE = 800;

    private const TIPOS = [
        IMAGETYPE_JPEG => 'jpeg',
        IMAGETYPE_PNG  => 'png',
        IMAGETYPE_WEBP => 'webp',
    ];

    private const DIMENSION_MAXIMA = 12000;

    /**
     * Lee y valida (tamaño) una subida antes de procesarla. La validación del
     * contenido real la hace normalizar() con getimagesizefromstring.
     */
    public function leerSubida(UploadedFile $archivo): string
    {
        if (! $archivo->isValid()) {
            throw ApiException::badRequest('La imagen no se recibió correctamente.');
        }
        if ((int) $archivo->getSize() > 8 * 1024 * 1024) {
            throw ApiException::validacion('La imagen supera el tamaño máximo permitido.', ['La imagen supera el tamaño máximo permitido.']);
        }

        $contenido = (string) file_get_contents($archivo->getTempName());
        if ($contenido === '') {
            throw ApiException::validacion('No se pudo leer la imagen.', ['No se pudo leer la imagen.']);
        }

        return $contenido;
    }

    /**
     * @param string $contenido bytes de la imagen original
     * @param string $modo      'contain' | 'cover'
     * @param string $salida    'jpeg' | 'png' | 'webp'
     *
     * @return array{bytes: string, mime: string, extension: string}
     */
    public function normalizar(string $contenido, string $modo, string $salida = 'jpeg'): array
    {
        if ($contenido === '' || strlen($contenido) > 8 * 1024 * 1024) {
            throw ApiException::validacion('La imagen no es válida o supera el tamaño permitido.', ['La imagen no es válida.']);
        }

        $info = @getimagesizefromstring($contenido);
        if ($info === false || ! isset(self::TIPOS[$info[2]])) {
            throw ApiException::validacion('El archivo no es una imagen JPG, PNG o WEBP válida.', ['El archivo no es una imagen válida.']);
        }
        [$ancho, $alto] = $info;
        if ($ancho < 1 || $alto < 1 || $ancho > self::DIMENSION_MAXIMA || $alto > self::DIMENSION_MAXIMA) {
            throw ApiException::validacion('Las dimensiones de la imagen no son válidas.', ['Las dimensiones de la imagen no son válidas.']);
        }

        $origen = @imagecreatefromstring($contenido);
        if ($origen === false) {
            throw ApiException::validacion('No se pudo procesar la imagen.', ['No se pudo procesar la imagen.']);
        }

        $tamano = self::SIZE;
        $destino = imagecreatetruecolor($tamano, $tamano);

        if ($modo === 'cover') {
            $escala  = max($tamano / $ancho, $tamano / $alto);
            $nuevoW  = (int) ceil($ancho * $escala);
            $nuevoH  = (int) ceil($alto * $escala);
            $destX   = (int) round((($tamano - $nuevoW) / 2));
            $destY   = (int) round((($tamano - $nuevoH) / 2));
            imagecopyresampled($destino, $origen, $destX, $destY, 0, 0, $nuevoW, $nuevoH, $ancho, $alto);
        } else {
            $blanco = imagecolorallocate($destino, 255, 255, 255);
            imagefilledrectangle($destino, 0, 0, $tamano, $tamano, $blanco);
            $escala = min($tamano / $ancho, $tamano / $alto);
            $nuevoW = (int) round($ancho * $escala);
            $nuevoH = (int) round($alto * $escala);
            $destX  = (int) round(($tamano - $nuevoW) / 2);
            $destY  = (int) round(($tamano - $nuevoH) / 2);
            imagecopyresampled($destino, $origen, $destX, $destY, 0, 0, $nuevoW, $nuevoH, $ancho, $alto);
        }

        imagedestroy($origen);

        $salida = in_array($salida, ['jpeg', 'png', 'webp'], true) ? $salida : 'jpeg';
        ob_start();
        switch ($salida) {
            case 'png':
                imagesavealpha($destino, true);
                imagepng($destino, null, 8);
                $mime = 'image/png';
                $ext  = 'png';
                break;
            case 'webp':
                imagewebp($destino, null, 85);
                $mime = 'image/webp';
                $ext  = 'webp';
                break;
            default:
                imagejpeg($destino, null, 85);
                $mime = 'image/jpeg';
                $ext  = 'jpg';
                break;
        }
        $bytes = (string) ob_get_clean();
        imagedestroy($destino);

        if ($bytes === '') {
            throw ApiException::validacion('No se pudo generar la imagen normalizada.', ['No se pudo generar la imagen normalizada.']);
        }

        return ['bytes' => $bytes, 'mime' => $mime, 'extension' => $ext];
    }
}
