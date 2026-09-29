<?php

// SPDX-License-Identifier: MIT

namespace App\Validation;

use App\Exceptions\ApiException;

/**
 * Validación de datos recibidos desde el frontend. El backend siempre revalida
 * lo que React envía (RT-22). Reglas planas: required, min, max, email, ruc, dni,
 * telefono, fecha, fecha_hora, regex, enum, igual (confirmación de contraseñas).
 */
final class Validador
{
    /**
     * Fecha calendárica AAAA-MM-DD (rechaza meses/días inexistentes, no solo
     * el formato). El regex por sí solo acepta 2026-13-01 o 2026-02-31.
     */
    public static function esFecha(string $valor): bool
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $valor, $m) !== 1) {
            return false;
        }

        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /**
     * Texto visible de un contenido (HTML sanitizado o texto plano): sin
     * etiquetas, con entidades decodificadas y espacios duros normalizados.
     * Es la definición canónica compartida con el contador del frontend.
     */
    public static function textoVisible(string $html): string
    {
        $texto = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return str_replace("\u{00A0}", ' ', $texto);
    }

    /**
     * Longitud en caracteres (code points Unicode) del texto visible, no del
     * HTML. `"Hola <strong>mundo</strong>"` cuenta 10, nunca las etiquetas.
     */
    public static function longitudTexto(string $html): int
    {
        return mb_strlen(self::textoVisible($html));
    }

    /**
     * Fecha y hora calendárica; admite `AAAA-MM-DD` y `AAAA-MM-DD HH:MM[:SS]`.
     */
    public static function esFechaHora(string $valor): bool
    {
        if (self::esFecha($valor)) {
            return true;
        }
        if (preg_match('/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/', $valor, $m) !== 1) {
            return false;
        }

        return self::esFecha($m[1])
            && (int) $m[2] <= 23
            && (int) $m[3] <= 59
            && (! isset($m[4]) || (int) $m[4] <= 59);
    }

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

                    case $regla === 'fecha' && ! self::esFecha((string) $valor):
                        $errores[$campo] = "El campo {$etiqueta} debe ser una fecha válida (AAAA-MM-DD).";
                        break 2;

                    case $regla === 'fecha_hora' && ! self::esFechaHora((string) $valor):
                        $errores[$campo] = "El campo {$etiqueta} debe ser una fecha y hora válidas.";
                        break 2;

                    case str_starts_with($regla, 'min:') && mb_strlen((string) $valor) < (int) substr($regla, 4):
                        $errores[$campo] = "El campo {$etiqueta} debe tener al menos " . substr($regla, 4) . ' caracteres.';
                        break 2;

                    case str_starts_with($regla, 'max:') && mb_strlen((string) $valor) > (int) substr($regla, 4):
                        $errores[$campo] = "El campo {$etiqueta} no debe superar " . substr($regla, 4) . ' caracteres.';
                        break 2;

                    // Longitud del texto visible (RTE): no cuenta etiquetas HTML.
                    case str_starts_with($regla, 'texto_max:') && self::longitudTexto((string) $valor) > (int) substr($regla, 10):
                        $errores[$campo] = "El campo {$etiqueta} no debe superar " . substr($regla, 10) . ' caracteres de texto.';
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
