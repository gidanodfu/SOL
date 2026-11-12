#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Benchmark sintético del pipeline de imágenes. Genera patrones en memoria,
 * normaliza con ImageService y compara bytes de la imagen normalizada con una
 * miniatura de 128 px. No sube archivos ni toca Supabase.
 *
 * Uso: php tests/tools/image_pipeline_benchmark.php [--json=ruta]
 */

$opciones = getopt('', ['json:', 'help']);
if (isset($opciones['help'])) {
    fwrite(STDOUT, "Uso: php image_pipeline_benchmark.php [--json=ruta]\n");
    exit(0);
}

$backend = dirname(__DIR__, 2) . '/backend';
require $backend . '/vendor/autoload.php';
if (! function_exists('env')) {
    require $backend . '/vendor/codeigniter4/framework/system/Common.php';
}

$service = new App\Services\ImageService();

function imagen(int $ancho, int $alto, string $formato): string
{
    $im = imagecreatetruecolor($ancho, $alto);
    imagefill($im, 0, 0, imagecolorallocate($im, 245, 246, 248));
    for ($i = 0; $i < 12; $i++) {
        $color = imagecolorallocate($im, 20 + $i * 12, 80 + $i * 7, 150 - $i * 5);
        imagefilledrectangle(
            $im,
            (int) ($i * $ancho / 14),
            (int) ($i * $alto / 16),
            (int) (($i + 4) * $ancho / 14),
            (int) (($i + 6) * $alto / 16),
            $color,
        );
    }
    ob_start();
    if ($formato === 'png') {
        imagepng($im, null, 8);
        $mime = 'png';
    } elseif ($formato === 'webp') {
        imagewebp($im, null, 85);
        $mime = 'webp';
    } else {
        imagejpeg($im, null, 90);
        $mime = 'jpg';
    }
    $bytes = (string) ob_get_clean();
    imagedestroy($im);

    return $bytes;
}

function miniatura(string $bytes, int $lado, string $formato): int
{
    $origen = imagecreatefromstring($bytes);
    $destino = imagecreatetruecolor($lado, $lado);
    imagecopyresampled($destino, $origen, 0, 0, 0, 0, $lado, $lado, imagesx($origen), imagesy($origen));
    ob_start();
    if ($formato === 'webp') {
        imagewebp($destino, null, 80);
    } else {
        imagejpeg($destino, null, 82);
    }
    $mini = (string) ob_get_clean();
    imagedestroy($origen);
    imagedestroy($destino);

    return strlen($mini);
}

$t0 = microtime(true);
$logo = imagen(1600, 800, 'png');
$logoNormalizado = $service->normalizar($logo, 'contain', 'png');
$tLogo = (microtime(true) - $t0) * 1000;

$t1 = microtime(true);
$foto = imagen(1200, 1600, 'jpeg');
$fotoNormalizada = $service->normalizar($foto, 'cover', 'jpeg');
$tFoto = (microtime(true) - $t1) * 1000;

$actividad = imagen(1920, 1080, 'jpeg');
$actividadWebp = imagen(1280, 720, 'webp');

$resultado = [
    'logo' => [
        'origen_bytes'        => strlen($logo),
        'origen_dimensiones'  => [1600, 800],
        'normalizado_bytes'   => strlen($logoNormalizado['bytes']),
        'normalizado_mime'    => $logoNormalizado['mime'],
        'normalizado_dimensiones' => [800, 800],
        'miniatura_128_bytes' => miniatura($logoNormalizado['bytes'], 128, 'png'),
        'encode_ms'           => round($tLogo, 2),
    ],
    'foto' => [
        'origen_bytes'        => strlen($foto),
        'origen_dimensiones'  => [1200, 1600],
        'normalizado_bytes'   => strlen($fotoNormalizada['bytes']),
        'normalizado_mime'    => $fotoNormalizada['mime'],
        'normalizado_dimensiones' => [800, 800],
        'miniatura_128_bytes' => miniatura($fotoNormalizada['bytes'], 128, 'jpg'),
        'encode_ms'           => round($tFoto, 2),
    ],
    'actividad' => [
        'original_jpeg_1920x1080_bytes' => strlen($actividad),
        'webp_1280x720_bytes'           => strlen($actividadWebp),
        'nota' => 'La actividad conserva el original; WebP solo se midió como referencia experimental.',
    ],
];

$json = json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if (isset($opciones['json'])) {
    @mkdir(dirname($opciones['json']), 0775, true);
    file_put_contents($opciones['json'], $json . "\n");
}
fwrite(STDOUT, $json . "\n");
