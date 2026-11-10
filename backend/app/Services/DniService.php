<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Consulta de DNI en RENIEC a través de APIsPERU. El cliente compartido aporta
 * autenticación, transporte y manejo de errores; aquí solo se valida el
 * documento y se adapta la respuesta al contrato interno de SOL.
 *
 * Contrato interno: {dni, nombres, apellidos}
 */
class DniService
{
    private ApisperuClient $cliente;

    public function __construct(?ApisperuClient $cliente = null)
    {
        $this->cliente = $cliente ?? new ApisperuClient();
    }

    /**
     * @return array{dni: string, nombres: string, apellidos: string}
     */
    public function consultar(string $dni): array
    {
        // Validación propia: nunca se consulta al proveedor con un DNI inválido.
        if (preg_match('/^\d{8}$/', $dni) !== 1) {
            throw ApiException::validacion('El DNI debe tener 8 dígitos.', ['El DNI debe tener 8 dígitos.']);
        }

        $datos = $this->cliente->consultarDni($dni);

        $nombres = trim((string) ($datos['nombres'] ?? ''));
        if ($nombres === '') {
            throw ApiException::badRequest('El DNI no fue encontrado en RENIEC.');
        }

        $apellidos = trim(
            trim((string) ($datos['apellidoPaterno'] ?? '')) . ' '
            . trim((string) ($datos['apellidoMaterno'] ?? '')),
        );

        return [
            'dni'       => $dni,
            'nombres'   => $nombres,
            'apellidos' => $apellidos,
        ];
    }
}
