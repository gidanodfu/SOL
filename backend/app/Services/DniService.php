<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Consulta de DNI en RENIEC a través de JSON.pe (proveedor exclusivo de DNI).
 * El token vive solo en el backend (.env: jsonpe.token; se reutiliza dni.token
 * si no existe el primero). El frontend nunca ve el token ni llama a JSON.pe.
 *
 * Contrato del proveedor:
 *   POST https://api.json.pe/api/dni
 *   Authorization: Bearer <token>
 *   Body: {"dni":"12345678"}
 *   Respuesta 200: {success:true, data:{nombres, apellido_paterno, apellido_materno, ...}}
 *
 * NO usar Decolecta para DNI (Decolecta es el proveedor de RUC).
 */
class DniService
{
    private const ENDPOINT = 'https://api.json.pe/api/dni';

    private const TIMEOUT = 10;

    /**
     * @return array{dni: string, nombres: string, apellidos: string}
     */
    public function consultar(string $dni): array
    {
        // Validación propia: nunca se consulta al proveedor con un DNI inválido.
        if (preg_match('/^\d{8}$/', $dni) !== 1) {
            throw ApiException::validacion('El DNI debe tener 8 dígitos.', ['El DNI debe tener 8 dígitos.']);
        }

        $token = (string) (env('jsonpe.token') ?: env('dni.token'));
        if ($token === '') {
            throw ApiException::badRequest('La verificación del DNI no está disponible en este momento.');
        }

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode(['dni' => $dni], JSON_UNESCAPED_UNICODE),
        ]);

        $respuesta = curl_exec($ch);
        $codigo    = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errorCurl = curl_error($ch);
        curl_close($ch);

        // Sin respuesta (timeout, DNS, red): error controlado, nunca se expone el detalle.
        if ($respuesta === false || $errorCurl !== '') {
            throw ApiException::badRequest('No se pudo conectar con el servicio de consulta de DNI. Intente nuevamente.');
        }

        if ($codigo === 401 || $codigo === 403) {
            throw ApiException::badRequest('No se pudo verificar el DNI: el servicio rechazó la credencial.');
        }
        if ($codigo === 429) {
            throw ApiException::demasiadasSolicitudes('El servicio de consulta de DNI está saturado. Intente nuevamente en unos minutos.');
        }

        $datos = json_decode($respuesta, true);
        if (! is_array($datos)) {
            throw ApiException::badRequest('El servicio de consulta de DNI devolvió una respuesta inválida.');
        }

        // JSON.pe responde 200 con success=false cuando el DNI no existe/no se encuentra.
        if ($codigo === 404 || ($datos['success'] ?? null) === false) {
            throw ApiException::badRequest('El DNI no fue encontrado en RENIEC.');
        }
        if ($codigo < 200 || $codigo >= 300) {
            throw ApiException::badRequest('No se pudo verificar el DNI. Intente nuevamente en unos segundos.');
        }

        $persona = $datos['data'] ?? null;
        if (! is_array($persona) || empty($persona['nombres'])) {
            throw ApiException::badRequest('El DNI no fue encontrado en RENIEC.');
        }

        $apellidos = trim(($persona['apellido_paterno'] ?? '') . ' ' . ($persona['apellido_materno'] ?? ''));

        return [
            'dni'       => $dni,
            'nombres'   => (string) $persona['nombres'],
            'apellidos' => $apellidos,
        ];
    }
}
