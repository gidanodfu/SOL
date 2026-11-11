<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Verificación de RUC en SUNAT a través de APIsPERU. El cliente compartido
 * aporta autenticación, transporte y manejo de errores; aquí solo se valida el
 * documento y se adapta la respuesta al contrato interno de SOL.
 *
 * Contrato interno: {razon_social, nombre_comercial, direccion}
 */
class RucService
{
    private ApisperuClient $cliente;

    public function __construct(?ApisperuClient $cliente = null)
    {
        $this->cliente = $cliente ?? new ApisperuClient();
    }

    /**
     * @return array{razon_social: string, nombre_comercial: ?string, direccion: ?string}
     */
    public function consultar(string $ruc): array
    {
        if (preg_match('/^\d{11}$/', $ruc) !== 1) {
            throw ApiException::validacion('El RUC debe tener 11 dígitos.', ['El RUC debe tener 11 dígitos.']);
        }

        $datos = $this->cliente->consultarRuc($ruc);

        $razonSocial = trim((string) ($datos['razonSocial'] ?? ''));
        if ($razonSocial === '') {
            throw ApiException::badRequest('El RUC no fue encontrado en SUNAT.');
        }

        $nombreComercial = trim((string) ($datos['nombreComercial'] ?? ''));
        if ($nombreComercial === '' || $nombreComercial === '-' || $nombreComercial === '—') {
            $nombreComercial = null;
        }

        $partes = array_filter([
            $datos['direccion'] ?? null,
            $datos['distrito'] ?? null,
            $datos['provincia'] ?? null,
            $datos['departamento'] ?? null,
        ], static fn ($valor) => is_string($valor)
            && trim($valor) !== ''
            && trim($valor) !== '-'
            && trim($valor) !== '—');

        return [
            'razon_social'     => $razonSocial,
            'nombre_comercial' => $nombreComercial,
            'direccion'        => $partes === []
                ? null
                : implode(', ', array_map('trim', array_values($partes))),
        ];
    }
}
