<?php

// SPDX-License-Identifier: MIT

namespace App\Validation;

use App\Exceptions\ApiException;

/**
 * Validación de datos recibidos desde el frontend. El backend siempre revalida
 * lo que React envía (RT-22). Reglas planas: required, min, max, email, ruc, dni,
 * regex, enum, igual (confirmación de contraseñas).
 */
final class Validador
{
    /**
     * @param array<string, mixed> $datos
     * @param array<string, list<string>> $reglas campo => reglas
     *
     * @throws ApiException con errores campo => mensaje
     */
    public static function validar(array $datos, array $reglas): void
    {
        $errores = [];

        foreach ($reglas as $campo => $reglasCampo) {
            $valor = $datos[$campo] ?? null;
            $etiqueta = ucfirst(str_replace('_', ' ', $campo));

            foreach ($reglasCampo as $regla) {
                if ($regla === 'required' && ($valor === null || $valor === '')) {
                    $errores[$campo] = "El campo {$etiqueta} es obligatorio.";
                    break;
                }
                if ($valor === null || $valor === '') {
                    continue;
                }

                switch (true) {
                    case $regla === 'email' && filter_var($valor, FILTER_VALIDATE_EMAIL) === false:
                        $errores[$campo] = "El campo {$etiqueta} debe ser un correo válido.";
                        break 2;

                    case $regla === 'ruc' && ! preg_match('/^\d{11}$/', (string) $valor):
                        $errores[$campo] = "El campo {$etiqueta} debe ser un RUC de 11 dígitos.";
                        break 2;

                    case $regla === 'dni' && ! preg_match('/^\d{8}$/', (string) $valor):
                        $errores[$campo] = "El campo {$etiqueta} debe ser un DNI de 8 dígitos.";
                        break 2;

                    case $regla === 'telefono' && ! preg_match('/^(?:\d{9}|\d{11})$/', (string) $valor):
                        $errores[$campo] = "El campo {$etiqueta} debe tener 9 u 11 dígitos.";
                        break 2;

                    case str_starts_with($regla, 'min:') && mb_strlen((string) $valor) < (int) substr($regla, 4):
                        $errores[$campo] = "El campo {$etiqueta} debe tener al menos " . substr($regla, 4) . ' caracteres.';
                        break 2;

                    case str_starts_with($regla, 'max:') && mb_strlen((string) $valor) > (int) substr($regla, 4):
                        $errores[$campo] = "El campo {$etiqueta} no debe superar " . substr($regla, 4) . ' caracteres.';
                        break 2;

                    case str_starts_with($regla, 'regex:'):
                        if (preg_match(substr($regla, 6), (string) $valor) !== 1) {
                            $errores[$campo] = "El campo {$etiqueta} no tiene un formato válido.";
                            break 2;
                        }
                        break;

                    case str_starts_with($regla, 'enum:'):
                        if (! in_array($valor, explode(',', substr($regla, 5)), true)) {
                            $errores[$campo] = "El campo {$etiqueta} tiene un valor no permitido.";
                            break 2;
                        }
                        break;

                    case str_starts_with($regla, 'igual:'):
                        $otro = substr($regla, 6);
                        if (! array_key_exists($otro, $datos) || $datos[$otro] !== $valor) {
                            $errores[$campo] = 'La confirmación no coincide.';
                            break 2;
                        }
                        break;
                }
            }
        }

        if ($errores !== []) {
            throw ApiException::validacion('Hay errores en los datos enviados.', array_values($errores));
        }
    }
}
