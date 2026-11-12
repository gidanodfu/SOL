#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Prueba de cache stampede para imágenes públicas.
 *
 * Lanza N procesos hijos que piden la misma objectKey con la caché vacía. El
 * mock de almacenamiento cuenta cuántas descargas externas se ejecutan.
 *
 * Uso:
 *   php tests/tools/image_cache_stampede.php [--hijos=10] [--expect=1]
 *
 * Sale con código 1 si el número de descargas no coincide con --expect.
 */

$backend = dirname(__DIR__, 2) . '/backend';
require $backend . '/vendor/autoload.php';
if (! function_exists('env')) {
    require $backend . '/vendor/codeigniter4/framework/system/Common.php';
}
if (! defined('WRITEPATH')) {
    define('WRITEPATH', sys_get_temp_dir() . DIRECTORY_SEPARATOR);
}

$opciones = getopt('', ['child', 'cache:', 'counter:', 'key:', 'hijos:', 'expect:', 'help']);

if (isset($opciones['help'])) {
    fwrite(STDOUT, "Uso: php image_cache_stampede.php [--hijos=10] [--expect=1]\n");
    exit(0);
}

require_once __DIR__ . '/image_cache_probe.php';

if (isset($opciones['child'])) {
    $cache   = (string) ($opciones['cache'] ?? '');
    $counter = (string) ($opciones['counter'] ?? '');
    $key     = (string) ($opciones['key'] ?? '');

    $servicio = new CacheProbeStorage($cache, $counter);
    $contenido = $servicio->obtenerImagen($key);

    exit($contenido === 'contenido-sintetico' ? 0 : 3);
}

$hijos  = max(1, (int) ($opciones['hijos'] ?? 10));
$expect = isset($opciones['expect']) ? (int) $opciones['expect'] : 1;
$key    = 'empresas/logo/1/' . bin2hex(random_bytes(8)) . '.png';
$raiz   = sys_get_temp_dir() . '/sol-stampede-' . bin2hex(random_bytes(6));
$cache  = $raiz . '/cache';
$contador = $raiz . '/descargas.log';

if (! mkdir($cache, 0775, true) && ! is_dir($cache)) {
    fwrite(STDERR, "ERROR: no se pudo crear el directorio temporal.\n");
    exit(2);
}

$procesos = [];
for ($i = 0; $i < $hijos; $i++) {
    $comando = [
        PHP_BINARY,
        __FILE__,
        '--child',
        '--cache=' . $cache,
        '--counter=' . $contador,
        '--key=' . $key,
    ];
    $descriptores = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proceso = proc_open($comando, $descriptores, $tuberias);
    if (! is_resource($proceso)) {
        fwrite(STDERR, "ERROR: no se pudo lanzar el proceso {$i}.\n");
        exit(2);
    }
    fclose($tuberias[0]);
    $procesos[] = [$proceso, $tuberias, $i];
}

$fallos = 0;
foreach ($procesos as [$proceso, $tuberias, $i]) {
    $salida = stream_get_contents($tuberias[1]);
    $error  = stream_get_contents($tuberias[2]);
    fclose($tuberias[1]);
    fclose($tuberias[2]);
    $codigo = proc_close($proceso);
    if ($codigo !== 0) {
        $fallos++;
        fwrite(STDERR, "Hijo {$i} falló ({$codigo}): {$error}{$salida}\n");
    }
}

$descargas = is_file($contador)
    ? count(file($contador, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES))
    : 0;

$resultado = [
    'hijos'             => $hijos,
    'descargas_externas' => $descargas,
    'esperadas'         => $expect,
    'fallos_hijos'      => $fallos,
    'cache_hit'         => $descargas === 1,
];

fwrite(STDOUT, json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

// Limpieza del directorio temporal.
$limpiar = static function (string $ruta) use (&$limpiar): void {
    if (is_file($ruta)) {
        @unlink($ruta);

        return;
    }
    if (! is_dir($ruta)) {
        return;
    }
    foreach (scandir($ruta) ?: [] as $entrada) {
        if ($entrada !== '.' && $entrada !== '..') {
            $limpiar($ruta . DIRECTORY_SEPARATOR . $entrada);
        }
    }
    @rmdir($ruta);
};
$limpiar($raiz);

exit(($descargas === $expect && $fallos === 0) ? 0 : 1);
