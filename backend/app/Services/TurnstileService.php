<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Verificación server-side de Cloudflare Turnstile (Siteverify). El widget del
 * navegador NO es suficiente: el backend es la única autoridad que valida el
 * token contra Cloudflare.
 *
 * - Fail-closed: token ausente, inválido, expirado, duplicado, error HTTP,
 *   timeout o respuesta inesperada => se rechaza la operación.
 * - Los códigos técnicos de Cloudflare se registran en el log del servidor y
 *   NUNCA se exponen al usuario ni a la respuesta HTTP.
 * - La Secret Key se lee exclusivamente de la configuración del backend.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
class TurnstileService
{
    private const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    private const TIMEOUT = 10;

    /** Mensaje genérico: no revela si falló el captcha, el token o el servicio. */
    private const MENSAJE_GENERICO = 'No se pudo verificar la seguridad de la solicitud. Inténtalo nuevamente.';

    public function habilitado(): bool
    {
        $activo = filter_var(env('turnstile.enabled'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $activo !== false;
    }

    /**
     * Valida el token contra Cloudflare. Lanza ApiException si no es válido o
     * si no se pudo verificar (fail-closed).
     *
     * @throws ApiException
     */
    public function verificar(?string $token, ?string $ip = null): void
    {
        $secret = trim((string) env('turnstile.secretKey'));
        $token  = trim((string) $token);

        if ($secret === '') {
            // Configuración incompleta: no se puede validar => se rechaza.
            log_message('error', 'Turnstile: falta turnstile.secretKey en la configuración.');

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }
        if ($token === '') {
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $datos = http_build_query(array_filter([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $ip ?: null,
        ], static fn ($v) => $v !== null && $v !== ''));

        $respuesta = $this->enviar($datos);
        if ($respuesta === null) {
            // Cloudflare no respondió o devolvió un error HTTP => fail-closed.
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $resultado = json_decode($respuesta, true);
        if (! is_array($resultado) || ($resultado['success'] ?? false) !== true) {
            $codigos = is_array($resultado['error-codes'] ?? null)
                ? implode(',', $resultado['error-codes'])
                : 'sin-codigos';
            log_message('error', 'Turnstile siteverify rechazó el token: {codigos}', ['codigos' => $codigos]);

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        // Controles adicionales opcionales (recomendados por Cloudflare).
        $accionEsperada = trim((string) env('turnstile.action'));
        if ($accionEsperada !== '' && (string) ($resultado['action'] ?? '') !== $accionEsperada) {
            log_message('error', 'Turnstile: action inesperada.');

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $hosts = array_filter(array_map('trim', explode(',', (string) env('turnstile.hostnames'))));
        if ($hosts !== [] && ! in_array((string) ($resultado['hostname'] ?? ''), $hosts, true)) {
            log_message('error', 'Turnstile: hostname no permitido.');

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }
    }

    /**
     * POST x-www-form-urlencoded a Siteverify. Null ante error de red/HTTP.
     */
    private function enviar(string $cuerpo): ?string
    {
        $ch = curl_init(self::SITEVERIFY_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
        ]);

        $respuesta = curl_exec($ch);
        $codigo    = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error     = curl_error($ch);
        curl_close($ch);

        if ($respuesta === false || $codigo < 200 || $codigo >= 300) {
            log_message('error', 'Turnstile siteverify no disponible: HTTP {codigo} {error}', [
                'codigo' => $codigo,
                'error'  => $error,
            ]);

            return null;
        }

        return is_string($respuesta) ? $respuesta : null;
    }
}
