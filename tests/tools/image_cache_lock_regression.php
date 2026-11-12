#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Regresión del bloqueo de caché:
 *  1. Dos descriptores sobre la misma ruta comparten el flock.
 *  2. Si se elimina la ruta mientras un worker la tiene bloqueada, un segundo
 *     worker puede crear un inodo nuevo y adquirir un bloqueo independiente.
 *
 * El segundo caso es exactamente el peligro de limpiar archivos .lock desde el
 * flujo normal de escritura. La prueba documenta la separación y el código de
 * StorageService no debe borrar bloqueos en ese flujo.
 *
 * Uso: php tests/tools/image_cache_lock_regression.php
 */

$opciones = getopt('', ['hold', 'ruta:', 'help']);
if (isset($opciones['help'])) {
    fwrite(STDOUT, "Uso: php image_cache_lock_regression.php\n");
    exit(0);
}

if (isset($opciones['hold'])) {
    $ruta = (string) ($opciones['ruta'] ?? '');
    $fh = fopen($ruta, 'c');
    if ($fh === false || ! flock($fh, LOCK_EX)) {
        fwrite(STDERR, "No se pudo bloquear.\n");
        exit(2);
    }
    fwrite(STDOUT, "locked\n");
    fflush(STDOUT);
    sleep(3);
    flock($fh, LOCK_UN);
    fclose($fh);

    return;
}

$raiz = sys_get_temp_dir() . '/sol-lock-' . bin2hex(random_bytes(6));
if (! mkdir($raiz, 0775, true) && ! is_dir($raiz)) {
    fwrite(STDERR, "No se pudo crear el directorio temporal.\n");
    exit(2);
}
$ruta = $raiz . '/.object.lock';

$proceso = proc_open(
    [PHP_BINARY, __FILE__, '--hold', '--ruta=' . $ruta],
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
    $tuberias,
);
if (! is_resource($proceso)) {
    fwrite(STDERR, "No se pudo iniciar el worker.\n");
    exit(2);
}
fclose($tuberias[0]);
$linea = fgets($tuberias[1]);
if (trim((string) $linea) !== 'locked') {
    fwrite(STDERR, "El worker no confirmó el bloqueo.\n");
    exit(2);
}

// Misma ruta: el bloqueo debe compartirse.
$fh = fopen($ruta, 'c');
$mismoBloqueo = $fh !== false && ! flock($fh, LOCK_EX | LOCK_NB);
if ($fh !== false) {
    flock($fh, LOCK_UN);
    fclose($fh);
}

// Simula la limpieza peligrosa: eliminar la ruta mientras el worker la usa.
unlink($ruta);

// La ruta nueva es otro inodo: el bloqueo anterior ya no protege.
$fh2 = fopen($ruta, 'c');
$separacion = $fh2 !== false && flock($fh2, LOCK_EX | LOCK_NB);
if ($fh2 !== false) {
    flock($fh2, LOCK_UN);
    fclose($fh2);
}

stream_get_contents($tuberias[1]);
stream_get_contents($tuberias[2]);
fclose($tuberias[1]);
fclose($tuberias[2]);
proc_close($proceso);

@unlink($ruta);
@rmdir($raiz);

$resultado = [
    'bloqueo_compartido_misma_ruta' => $mismoBloqueo,
    'separacion_tras_unlink'        => $separacion,
    'conclusion'                    => $separacion
        ? 'Unlink durante el bloqueo permite un segundo bloqueo independiente; no debe hacerse en el flujo normal.'
        : 'No se reprodujo la separación de inodos.',
];

fwrite(STDOUT, json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
exit($mismoBloqueo && $separacion ? 0 : 1);
