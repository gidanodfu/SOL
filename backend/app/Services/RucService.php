<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Verificación de RUC en apis.net.pe (endpoint v1 servido por decolecta.com). El
 * token vive solo en el backend (.env: sunat.token). Autocompleta razón social,
 * nombre comercial y dirección para el formulario de registro de la empresa.
 */
class RucService
{
    private const ENDPOINT = 'https://api.decolecta.com/v1/sunat/ruc';

    /**
     * @return array{razon_social: string, nombre_comercial: ?string, direccion: ?string}
     */
    public function consultar(string $ruc): array
    {
        $token = (string) env('sunat.token');
        if ($token === '') {
            throw ApiException::badRequest('La verificación del RUC no está disponible en este momento.');
        }

        $ch = curl_init(self::ENDPOINT . '?' . http_build_query(['numero' => $ruc]));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $token,
                'Referer: http://apis.net.pe/api-ruc',
                'Accept: application/json',
            ],
        ]);

        $respuesta = curl_exec($ch);
        $codigo    = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($respuesta === false || $codigo < 200 || $codigo >= 300) {
            throw ApiException::badRequest('No se pudo verificar el RUC. Intente nuevamente en unos segundos.');
        }

        $datos = json_decode($respuesta, true);
        if (! is_array($datos) || empty($datos['razon_social'])) {
            throw ApiException::badRequest('El RUC no fue encontrado en SUNAT.');
        }

        $partes = array_filter([
            $datos['direccion'] ?? null,
            $datos['distrito'] ?? null,
            $datos['provincia'] ?? null,
            $datos['departamento'] ?? null,
        ], static fn ($v) => is_string($v) && $v !== '' && $v !== '-');

        return [
            'razon_social'     => (string) $datos['razon_social'],
            'nombre_comercial' => null,
            'direccion'        => $partes === [] ? null : implode(', ', $partes),
        ];
    }
}
