<?php

// SPDX-License-Identifier: MIT

namespace App\Libraries;

/**
 * Normalización única de identificadores de cuenta. El backend es la autoridad;
 * el frontend replica solo la presentación y el formato inmediato.
 */
final class Identidad
{
    public static function email(?string $valor): ?string
    {
        $email = mb_strtolower(trim((string) $valor));

        return $email === '' ? null : $email;
    }

    /**
     * Representación canónica de teléfono: dígitos nacionales de 9 posiciones.
     * Acepta 9 dígitos, 11 con prefijo 51 y el prefijo internacional 0051.
     */
    public static function telefono(?string $valor): ?string
    {
        $digitos = (string) preg_replace('/\D+/', '', (string) $valor);

        if ($digitos === '') {
            return null;
        }

        // Prefijo internacional peruano completo: 0051 + 9 dígitos.
        if (str_starts_with($digitos, '0051')) {
            $resto = substr($digitos, 4);

            return strlen($resto) === 9 ? $resto : $digitos;
        }

        // El formato 00 + exactamente 9 dígitos nacionales se admite
        // explícitamente; no se retira 00 de números de otra longitud.
        if (str_starts_with($digitos, '00')) {
            $resto = substr($digitos, 2);

            return strlen($resto) === 9 ? $resto : $digitos;
        }

        if (strlen($digitos) === 11 && str_starts_with($digitos, '51')) {
            return substr($digitos, 2);
        }

        return $digitos;
    }

    /** RUC sin espacios, puntos ni guiones; la validación de 11 dígitos es aparte. */
    public static function ruc(?string $valor): string
    {
        return (string) preg_replace('/[\s.\-]+/', '', trim((string) $valor));
    }

    /** DNI sin espacios, puntos ni guiones; la validación de 8 dígitos es aparte. */
    public static function dni(?string $valor): string
    {
        return (string) preg_replace('/[\s.\-]+/', '', trim((string) $valor));
    }

    /**
     * Tipo de identificador recibido en el login. No consulta la base.
     */
    public static function tipoLogin(string $valor): string
    {
        $valor = trim($valor);
        if (str_contains($valor, '@')) {
            return 'email';
        }

        $digitos = (string) preg_replace('/[\s.\-]+/', '', $valor);
        if ($digitos !== '' && ctype_digit($digitos)) {
            if (strlen($digitos) === 11) {
                return 'ruc';
            }
            if (strlen($digitos) === 8) {
                return 'dni';
            }
        }

        return 'usuario';
    }

    public static function normalizarLogin(string $valor): string
    {
        return match (self::tipoLogin($valor)) {
            'email' => (string) self::email($valor),
            'ruc'   => self::ruc($valor),
            'dni'   => self::dni($valor),
            default => trim($valor),
        };
    }
}
