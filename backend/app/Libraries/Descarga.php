<?php

// SPDX-License-Identifier: MIT

namespace App\Libraries;

/**
 * Construcción segura de nombres de descarga y de la cabecera
 * Content-Disposition. Se usa en todas las respuestas que entregan archivos
 * cuyo nombre proviene del cliente (CV de postulante y de empresa).
 *
 * Reglas:
 *  - el nombre se reduce a su componente final (sin rutas de Linux/Windows);
 *  - se eliminan caracteres de control (CR/LF/NUL) y comillas, por lo que no
 *    puede inyectar cabeceras ni romper el valor entrecomillado;
 *  - se conserva el nombre legible en UTF-8 mediante filename* (RFC 5987) y
 *    se envía un fallback ASCII solo con caracteres seguros.
 */
final class Descarga
{
    private const NOMBRE_MAXIMO = 120;

    public static function contentDisposition(string $nombre, string $porDefecto = 'documento'): string
    {
        $seguro = self::nombreSeguro($nombre, $porDefecto);

        return 'attachment; filename="' . self::ascii($seguro, $porDefecto) . '"'
            . "; filename*=UTF-8''" . rawurlencode($seguro);
    }

    /**
     * Nombre de archivo saneado, conservando caracteres Unicode legítimos
     * (tildes, apóstrofes, paréntesis, etc.).
     */
    public static function nombreSeguro(string $nombre, string $porDefecto = 'documento'): string
    {
        // Solo el último componente, tanto para "/" como para "\".
        $partes = preg_split('#[/\\\\]+#', $nombre) ?: [];
        $nombre = (string) end($partes);

        if ($nombre === '' || ! mb_check_encoding($nombre, 'UTF-8')) {
            $nombre = mb_convert_encoding($nombre, 'UTF-8', 'UTF-8');
        }

        // Controles (incluye CR, LF, NUL), comillas y marcas bidireccionales.
        $nombre = (string) preg_replace(
            '/[\x00-\x1F\x7F"\x{202A}-\x{202E}\x{2066}-\x{2069}]/u',
            '',
            $nombre,
        );

        // Reservados en sistemas de archivos y en cabeceras.
        $nombre = (string) preg_replace('/[<>:|?*]+/u', '_', $nombre);
        $nombre = (string) preg_replace('/\s+/u', ' ', $nombre);
        // Windows no admite puntos ni espacios finales: se recortan.
        $nombre = trim($nombre, " .\t");

        if ($nombre === '') {
            return $porDefecto;
        }

        if (mb_strlen($nombre) > self::NOMBRE_MAXIMO) {
            $info = pathinfo($nombre);
            $ext  = isset($info['extension']) && $info['extension'] !== '' ? '.' . $info['extension'] : '';
            $base = mb_substr((string) ($info['filename'] ?? ''), 0, max(1, self::NOMBRE_MAXIMO - mb_strlen($ext)));
            $nombre = $base . $ext;
        }

        return $nombre === '' ? $porDefecto : $nombre;
    }

    /**
     * Variante ASCII para el parámetro filename="...". Nunca contiene comillas,
     * barras, controles ni caracteres no ASCII.
     */
    private static function ascii(string $nombre, string $porDefecto): string
    {
        // Transliteración explícita de los caracteres habituales en español;
        // iconv no translitera de forma uniforme en todas las plataformas.
        $nombre = strtr($nombre, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
            'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u',
            'À' => 'A', 'È' => 'E', 'Ì' => 'I', 'Ò' => 'O', 'Ù' => 'U',
            'â' => 'a', 'ê' => 'e', 'î' => 'i', 'ô' => 'o', 'û' => 'u',
            'Â' => 'A', 'Ê' => 'E', 'Î' => 'I', 'Ô' => 'O', 'Û' => 'U',
            'ç' => 'c', 'Ç' => 'C',
        ]);

        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nombre);
        if ($ascii === false || $ascii === '') {
            $ascii = $nombre;
        }

        $ascii = (string) preg_replace('/[^A-Za-z0-9._-]+/', '_', $ascii);
        $ascii = trim((string) preg_replace('/_+/', '_', $ascii), ' ._-');

        return $ascii === '' ? $porDefecto : $ascii;
    }
}
