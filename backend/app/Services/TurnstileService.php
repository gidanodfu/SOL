<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Verificación server-side de Cloudflare Turnstile (Siteverify). El widget del
 * navegador NO es suficiente: el backend es la única autoridad que valida el
 * token contra Cloudflare.
 *
 * - Fail-closed: configuración incompleta, token ausente, inválido, expirado,
 *   duplicado, error HTTP, timeout o respuesta inesperada => se rechaza.
 * - La acción esperada la decide cada operación; no existe una acción global.
 * - Los códigos técnicos se registran en el log y NUNCA se exponen al usuario.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
class TurnstileService
{
    private const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    private const MAX_TOKEN_LENGTH = 2048;

    private const TIMEOUT_CONEXION = 5;

    private const TIMEOUT_TOTAL = 10;

    /** Mensaje genérico: no revela qué comprobación falló. */
    private const MENSAJE_GENERICO = 'No se pudo verificar la seguridad de la solicitud. Inténtalo nuevamente.';

    /** @var callable(string): ?string|null */
    private $transporte;

    /**
     * @param callable(string): ?string|null $transporte transporte inyectable
     *        para pruebas; recibe el cuerpo POST y devuelve el JSON o null.
     */
    public function __construct(?callable $transporte = null)
    {
        $this->transporte = $transporte;
    }

    /**
     * Indica si la protección está activa. Un valor ausente se considera
     * desactivado en desarrollo/testing, pero nunca en producción.
     */
    public function habilitado(): bool
    {
        $raw = env('turnstile.enabled');

        if ($raw === null || trim((string) $raw) === '') {
            if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
                log_message('error', 'Turnstile: turnstile.enabled es obligatorio en producción.');
                throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
            }

            return false;
        }

        $valor = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($valor === null) {
            log_message('error', 'Turnstile: turnstile.enabled no es un booleano válido.');
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }
        if ($valor === false && defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            $this->fallarConfiguracion('Turnstile debe estar habilitado en producción');
        }

        return $valor;
    }

    /**
     * Valida el token contra Cloudflare. Lanza ApiException si no es válido o
     * si no se pudo verificar (fail-closed).
     *
     * @throws ApiException
     */
    public function verificar(mixed $token, string $accionEsperada, ?string $ip = null): void
    {
        $accionEsperada = trim($accionEsperada);
        if ($accionEsperada === '') {
            $this->fallarConfiguracion('acción esperada vacía');
        }

        $secret = trim((string) env('turnstile.secretKey'));
        $siteKey = trim((string) env('VITE_TURNSTILE_SITE_KEY'));
        $hosts = $this->hostnamesPermitidos();

        if ($secret === '') {
            $this->fallarConfiguracion('falta turnstile.secretKey');
        }
        if ($siteKey === '') {
            $this->fallarConfiguracion('falta VITE_TURNSTILE_SITE_KEY');
        }
        if ($hosts === []) {
            $this->fallarConfiguracion('lista de hostnames vacía');
        }

        if (! is_string($token)) {
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $token = trim($token);
        if ($token === '' || strlen($token) > self::MAX_TOKEN_LENGTH) {
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $cuerpo = http_build_query(array_filter([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $ip ?: null,
        ], static fn ($valor) => $valor !== null && $valor !== ''));

        try {
            $respuesta = $this->transporte !== null
                ? ($this->transporte)($cuerpo)
                : $this->enviar($cuerpo);
        } catch (\Throwable $e) {
            log_message('error', 'Turnstile siteverify no disponible: {error}', ['error' => $e->getMessage()]);
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        if (! is_string($respuesta) || trim($respuesta) === '') {
            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $resultado = json_decode($respuesta, true);
        if (! is_array($resultado) || ! array_key_exists('success', $resultado) || $resultado['success'] !== true) {
            $codigos = is_array($resultado['error-codes'] ?? null)
                ? implode(',', $resultado['error-codes'])
                : 'sin-codigos';
            log_message('error', 'Turnstile siteverify rechazó el token: {codigos}', ['codigos' => $codigos]);

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        if ((string) ($resultado['action'] ?? '') !== $accionEsperada) {
            log_message('error', 'Turnstile: acción inesperada.');

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }

        $hostname = mb_strtolower(trim((string) ($resultado['hostname'] ?? '')));
        if ($hostname === '' || ! in_array($hostname, $hosts, true)) {
            log_message('error', 'Turnstile: hostname no autorizado.');

            throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
        }
    }

    /**
     * @return list<string>
     */
    private function hostnamesPermitidos(): array
    {
        $hosts = [];
        foreach (explode(',', (string) env('turnstile.hostnames')) as $host) {
            $host = mb_strtolower(trim((string) $host));
            if ($host === '') {
                continue;
            }
            if (strlen($host) > 253
                || preg_match('/^[a-z0-9.-]+$/', $host) !== 1
                || str_contains($host, '..')
                || str_contains($host, '://')
                || str_contains($host, '/')
                || str_contains($host, ':')) {
                $this->fallarConfiguracion('hostname inválido');
            }
            foreach (explode('.', $host) as $etiqueta) {
                if ($etiqueta === '' || preg_match('/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/', $etiqueta) !== 1) {
                    $this->fallarConfiguracion('hostname inválido');
                }
            }
            $hosts[] = $host;
        }

        return array_values(array_unique($hosts));
    }

    private function fallarConfiguracion(string $detalle): never
    {
        log_message('error', 'Turnstile: configuración incompleta ({detalle}).', ['detalle' => $detalle]);

        throw ApiException::validacion(self::MENSAJE_GENERICO, [self::MENSAJE_GENERICO]);
    }

    /**
     * POST x-www-form-urlencoded a Siteverify. Null ante error de red/HTTP.
     */
    protected function enviar(string $cuerpo): ?string
    {
        $ch = curl_init(self::SITEVERIFY_URL);
        if ($ch === false) {
            log_message('error', 'Turnstile: no se pudo inicializar cURL.');

            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_CONEXION,
            CURLOPT_TIMEOUT        => self::TIMEOUT_TOTAL,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
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
