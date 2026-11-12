<?php

// SPDX-License-Identifier: MIT

namespace App\Libraries;

use CodeIgniter\Database\Query;
use CodeIgniter\Events\Events;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Diagnóstico temporal de rendimiento por solicitud.
 *
 * Se activa con `PERF_DIAGNOSTICS=1` o, fuera de producción, con la cabecera
 * `X-Perf-Diagnostics: 1` (útil para benchmarks sin editar el `.env`).
 * Agrega el número y tiempo de consultas SQL, almacenamiento, llamadas externas
 * y serialización; expone `Server-Timing` y escribe una línea JSON en
 * `writable/logs/perf-AAAA-MM-DD.jsonl`.
 *
 * Nunca registra valores de bindings ni cuerpos: solo la consulta original con
 * marcadores normalizados. En producción permanece inactivo salvo que se
 * habilite explícitamente por variable de entorno.
 */
final class PerfDiagnostics
{
    private static bool $activo = false;

    private static bool $iniciado = false;

    private static bool $volcado = false;

    private static float $inicio = 0.0;

    private static int $consultas = 0;

    private static float $sqlMs = 0.0;

    private static float $almacenamientoMs = 0.0;

    private static float $externoMs = 0.0;

    private static float $serializacionMs = 0.0;

    private static string $consultaMasLenta = '';

    private static float $consultaMasLentaMs = 0.0;

    private static string $requestId = '';

    public static function iniciar(): void
    {
        if (self::$iniciado) {
            return;
        }

        self::$iniciado = true;
        self::$inicio   = (float) ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true));
        self::$activo   = self::solicitaDiagnostico();

        if (! self::$activo) {
            return;
        }

        self::$requestId = self::idSolicitud();
        Events::on('DBQuery', [self::class, 'registrarConsulta']);
    }

    public static function activo(): bool
    {
        return self::$activo;
    }

    public static function registrarConsulta(Query $query): void
    {
        if (! self::$activo) {
            return;
        }

        $ms = (float) $query->getDuration(6) * 1000;
        self::$consultas++;
        self::$sqlMs += $ms;

        if ($ms > self::$consultaMasLentaMs) {
            self::$consultaMasLentaMs = $ms;
            self::$consultaMasLenta   = self::normalizar($query->getOriginalQuery());
        }
    }

    public static function serializacion(float $ms): void
    {
        if (self::$activo) {
            self::$serializacionMs += $ms;
        }
    }

    /** Marca el inicio de una lectura/escritura de almacenamiento. */
    public static function inicioMedicion(): float
    {
        return self::$activo ? microtime(true) : 0.0;
    }

    public static function finAlmacenamiento(float $inicio): void
    {
        if (self::$activo && $inicio > 0.0) {
            self::$almacenamientoMs += (microtime(true) - $inicio) * 1000;
        }
    }

    public static function finExterno(float $inicio): void
    {
        if (self::$activo && $inicio > 0.0) {
            self::$externoMs += (microtime(true) - $inicio) * 1000;
        }
    }

    /**
     * Añade `Server-Timing` y el identificador de solicitud, y escribe la
     * evidencia una sola vez por petición.
     */
    public static function aplicar(ResponseInterface $response): ResponseInterface
    {
        if (! self::$activo) {
            return $response;
        }

        $total = max(0.0, (microtime(true) - self::$inicio) * 1000);
        $php   = max(0.0, $total - self::$sqlMs - self::$almacenamientoMs - self::$externoMs - self::$serializacionMs);

        $response->setHeader('X-Request-ID', self::$requestId);

        if (! self::$volcado) {
            self::$volcado = true;
            $response->setHeader('Server-Timing', implode(', ', [
                'total;dur=' . self::numero($total),
                'php;dur=' . self::numero($php),
                'sql;dur=' . self::numero(self::$sqlMs),
                'sql-count;desc="' . self::$consultas . '"',
                'storage;dur=' . self::numero(self::$almacenamientoMs),
                'external;dur=' . self::numero(self::$externoMs),
                'serialize;dur=' . self::numero(self::$serializacionMs),
            ]));

            self::registrar([
                'request_id'              => self::$requestId,
                'metodo'                  => strtoupper(service('request')->getMethod()),
                'ruta'                    => '/' . ltrim(service('request')->getPath(), '/'),
                'estado'                  => $response->getStatusCode(),
                'total_ms'                => round($total, 3),
                'php_ms'                  => round($php, 3),
                'sql_ms'                  => round(self::$sqlMs, 3),
                'sql_consultas'           => self::$consultas,
                'consulta_mas_lenta'      => self::$consultaMasLenta,
                'consulta_mas_lenta_ms'   => round(self::$consultaMasLentaMs, 3),
                'almacenamiento_ms'       => round(self::$almacenamientoMs, 3),
                'externo_ms'              => round(self::$externoMs, 3),
                'serializacion_ms'        => round(self::$serializacionMs, 3),
            ]);
        }

        return $response;
    }

    /**
     * Consulta normalizada: sin literales ni números, sin datos personales.
     */
    public static function normalizar(string $sql): string
    {
        $sql = preg_replace('/\s+/', ' ', trim($sql)) ?? '';
        $sql = preg_replace("/'(?:[^'\\\\]|\\\\.)*'/s", '?', $sql) ?? $sql;
        $sql = preg_replace('/"(?:[^"\\\\]|\\\\.)*"/s', '?', $sql) ?? $sql;
        $sql = preg_replace('/\b\d+(?:\.\d+)?\b/', '?', $sql) ?? $sql;
        // Una lista IN de cualquier tamaño comparte fingerprint.
        $sql = preg_replace('/\(\s*\?(?:\s*,\s*\?)+\s*\)/', '(?)', $sql) ?? $sql;

        return mb_substr($sql, 0, 500);
    }

    private static function solicitaDiagnostico(): bool
    {
        $valor = getenv('PERF_DIAGNOSTICS');
        if ($valor === false) {
            $valor = $_ENV['PERF_DIAGNOSTICS'] ?? $_SERVER['PERF_DIAGNOSTICS'] ?? '';
        }
        if (in_array(strtolower((string) $valor), ['1', 'true', 'on', 'yes'], true)) {
            return true;
        }

        // La cabecera solo se acepta fuera de producción: permite benchmarks
        // reproducibles en desarrollo sin tocar el .env real.
        if (ENVIRONMENT === 'production') {
            return false;
        }

        try {
            return service('request')->getHeaderLine('X-Perf-Diagnostics') === '1';
        } catch (Throwable) {
            return false;
        }
    }

    private static function idSolicitud(): string
    {
        try {
            $id = service('request')->getHeaderLine('X-Request-ID');
        } catch (Throwable) {
            $id = '';
        }

        return preg_match('/^[A-Za-z0-9._-]{1,64}$/', $id) === 1 ? $id : bin2hex(random_bytes(8));
    }

    private static function numero(float $valor): string
    {
        return number_format($valor, 2, '.', '');
    }

    /**
     * @param array<string, mixed> $datos
     */
    private static function registrar(array $datos): void
    {
        $directorio = WRITEPATH . 'logs';
        if (! is_dir($directorio) && ! @mkdir($directorio, 0775, true) && ! is_dir($directorio)) {
            return;
        }

        $linea = json_encode($datos, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($linea !== false) {
            @file_put_contents(
                $directorio . DIRECTORY_SEPARATOR . 'perf-' . date('Y-m-d') . '.jsonl',
                $linea . "\n",
                FILE_APPEND | LOCK_EX,
            );
        }
    }
}
