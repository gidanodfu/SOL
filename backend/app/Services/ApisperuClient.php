<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use RuntimeException;

/**
 * Cliente único de consultas DNI/RUC contra APIsPERU.
 *
 * - La URL base, el token y el timeout viven exclusivamente en la configuración
 *   del backend (`apisperu.*`). El token nunca se envía al frontend ni se
 *   incluye en logs.
 * - La autenticación usa `Authorization: Bearer`; el token no viaja en la URL.
 * - Cualquier fallo de transporte, HTTP o de formato se convierte en un error
 *   controlado sin exponer detalles internos.
 *
 * @see https://apisperu.com/servicios/dniruc/
 */
class ApisperuClient
{
    private const BASE_POR_DEFECTO = 'https://dniruc.apisperu.com/api/v1';

    private const TIMEOUT_POR_DEFECTO = 10;

    private const TIMEOUT_CONEXION = 5;

    /** @var callable(string, array<string, string>, int): array{status: int, body: string}|null */
    private $transporte;

    /**
     * @param callable(string, array<string, string>, int): array{status: int, body: string}|null $transporte
     *        transporte inyectable para pruebas; recibe URL, encabezados y timeout.
     */
    public function __construct(?callable $transporte = null)
    {
        $this->transporte = $transporte;
    }

    /**
     * @return array<string, mixed> respuesta decodificada del proveedor
     */
    public function consultarDni(string $dni): array
    {
        return $this->obtener('dni/' . $dni, 'DNI', 'RENIEC');
    }

    /**
     * @return array<string, mixed> respuesta decodificada del proveedor
     */
    public function consultarRuc(string $ruc): array
    {
        return $this->obtener('ruc/' . $ruc, 'RUC', 'SUNAT');
    }

    /**
     * @return array<string, mixed>
     */
    private function obtener(string $ruta, string $documento, string $registro): array
    {
        $token = trim((string) env('apisperu.token'));
        if ($token === '') {
            log_message('error', 'APIsPERU: falta apisperu.token en la configuración.');

            throw ApiException::badRequest("La verificación del {$documento} no está disponible en este momento.");
        }

        $base = rtrim(trim((string) env('apisperu.baseURL')), '/');
        if ($base === '') {
            $base = self::BASE_POR_DEFECTO;
        }

        $timeout = (int) env('apisperu.timeout');
        if ($timeout < 1) {
            $timeout = self::TIMEOUT_POR_DEFECTO;
        }

        $url = $base . '/' . $ruta;
        $headers = [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ];

        try {
            $respuesta = $this->transporte !== null
                ? ($this->transporte)($url, $headers, $timeout)
                : $this->enviar($url, $headers, $timeout);
        } catch (\Throwable $e) {
            // Nunca se registra la URL con credenciales, el token ni la traza.
            log_message('error', 'APIsPERU: fallo de transporte al consultar {documento}.', [
                'documento' => $documento,
            ]);

            throw ApiException::badRequest("No se pudo conectar con el servicio de consulta de {$documento}. Intente nuevamente.");
        }

        $status = (int) ($respuesta['status'] ?? 0);
        $cuerpo = is_string($respuesta['body'] ?? null) ? $respuesta['body'] : '';

        if ($status === 401 || $status === 403) {
            log_message('error', 'APIsPERU: credencial rechazada (HTTP {status}).', ['status' => $status]);

            throw ApiException::badRequest("No se pudo verificar el {$documento}: el servicio rechazó la credencial.");
        }

        if ($status === 429) {
            throw ApiException::demasiadasSolicitudes("El servicio de consulta de {$documento} está saturado. Intente nuevamente en unos minutos.");
        }

        if ($status === 404) {
            throw ApiException::badRequest("El {$documento} no fue encontrado en {$registro}.");
        }

        if ($status < 200 || $status >= 300) {
            log_message('error', 'APIsPERU: respuesta HTTP inesperada al consultar {documento}: {status}.', [
                'documento' => $documento,
                'status'    => $status,
            ]);

            throw ApiException::badRequest("No se pudo verificar el {$documento}. Intente nuevamente en unos segundos.");
        }

        $datos = json_decode($cuerpo, true);
        if (! is_array($datos) || $datos === []) {
            log_message('error', 'APIsPERU: respuesta JSON inválida al consultar {documento}.', [
                'documento' => $documento,
            ]);

            throw ApiException::badRequest("El servicio de consulta de {$documento} devolvió una respuesta inválida.");
        }

        // El proveedor documenta 200 con {success:false, message} para errores.
        if (array_key_exists('success', $datos) && $datos['success'] === false) {
            log_message('error', 'APIsPERU: el proveedor rechazó la consulta de {documento}.', [
                'documento' => $documento,
            ]);

            throw ApiException::badRequest("El {$documento} no fue encontrado en {$registro}.");
        }

        return $datos;
    }

    /**
     * GET autenticado con TLS verificado y timeouts acotados.
     *
     * @param list<string> $headers
     *
     * @return array{status: int, body: string}
     */
    private function enviar(string $url, array $headers, int $timeout): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('No se pudo inicializar cURL.');
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(self::TIMEOUT_CONEXION, $timeout),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $cuerpo = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($cuerpo === false || $error !== '') {
            throw new RuntimeException('Fallo de conexión con APIsPERU.');
        }

        return ['status' => $status, 'body' => (string) $cuerpo];
    }
}
