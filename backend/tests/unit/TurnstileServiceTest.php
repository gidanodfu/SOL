<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\TurnstileService;
use PHPUnit\Framework\TestCase;

/**
 * Validación server-side de Turnstile con transporte inyectado. No contacta
 * Cloudflare ni usa credenciales reales.
 */
final class TurnstileServiceTest extends TestCase
{
    /** @var list<string> */
    private array $claves = [
        'turnstile.enabled',
        'turnstile.secretKey',
        'turnstile.hostnames',
        'VITE_TURNSTILE_SITE_KEY',
    ];

    protected function setUp(): void
    {
        $this->setEnv('turnstile.enabled', 'true');
        $this->setEnv('turnstile.secretKey', 'test-secret');
        $this->setEnv('turnstile.hostnames', 'example.test, www.example.test');
        $this->setEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
    }

    protected function tearDown(): void
    {
        foreach ($this->claves as $clave) {
            putenv($clave);
            unset($_ENV[$clave], $_SERVER[$clave]);
        }
    }

    private function setEnv(string $clave, string $valor): void
    {
        putenv($clave . '=' . $valor);
        $_ENV[$clave] = $valor;
        $_SERVER[$clave] = $valor;
    }

    private function servicio(?callable $transporte = null): TurnstileService
    {
        return new TurnstileService($transporte ?? static fn (): ?string => json_encode([
            'success'  => true,
            'action'   => 'auth',
            'hostname' => 'example.test',
        ]));
    }

    private function rechazo(callable $accion): ApiException
    {
        try {
            $accion();
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getHttpCode());

            return $e;
        }

        $this->fail('La validación debía rechazar la solicitud.');
    }

    public function testTokenValidoConAccionYHostnameCorrectos(): void
    {
        $this->servicio()->verificar('token-valido', 'auth', '127.0.0.1');
        $this->addToAssertionCount(1);
    }

    public function testHostnamesSeNormalizanSinDistinguirMayusculasNiEspacios(): void
    {
        $this->servicio(static fn (): string => json_encode([
            'success'  => true,
            'action'   => 'auth',
            'hostname' => 'WWW.EXAMPLE.TEST',
        ]))->verificar('token', 'auth');

        $this->addToAssertionCount(1);
    }

    public function testHabilitadoAceptaBooleanosExplicitosYRechazaInvalidos(): void
    {
        $this->assertTrue($this->servicio()->habilitado());

        $this->setEnv('turnstile.enabled', 'false');
        $this->assertFalse($this->servicio()->habilitado());

        $this->setEnv('turnstile.enabled', 'quizas');
        $this->rechazo(fn () => $this->servicio()->habilitado());
    }

    public function testHabilitadoAusenteQuedaDesactivadoFueraDeProduccion(): void
    {
        putenv('turnstile.enabled');
        unset($_ENV['turnstile.enabled'], $_SERVER['turnstile.enabled']);

        $this->assertFalse($this->servicio()->habilitado());
    }

    public function testRechazaTokenAusenteVacioOTipoIncorrecto(): void
    {
        foreach ([null, '', '   ', ['token']] as $token) {
            $this->rechazo(fn () => $this->servicio()->verificar($token, 'auth'));
        }
    }

    public function testRechazaTokenDemasiadoLargo(): void
    {
        $this->rechazo(fn () => $this->servicio()->verificar(str_repeat('a', 2049), 'auth'));
    }

    public function testRechazaConfiguracionIncompleta(): void
    {
        $this->setEnv('turnstile.secretKey', '');
        $this->rechazo(fn () => $this->servicio()->verificar('token', 'auth'));

        $this->setEnv('turnstile.secretKey', 'test-secret');
        $this->setEnv('VITE_TURNSTILE_SITE_KEY', '');
        $this->rechazo(fn () => $this->servicio()->verificar('token', 'auth'));

        $this->setEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
        $this->setEnv('turnstile.hostnames', '');
        $this->rechazo(fn () => $this->servicio()->verificar('token', 'auth'));

        $this->setEnv('turnstile.hostnames', 'https://example.test');
        $this->rechazo(fn () => $this->servicio()->verificar('token', 'auth'));
    }

    public function testRechazaAccionVaciaOIncorrecta(): void
    {
        $this->rechazo(fn () => $this->servicio()->verificar('token', ''));

        $this->rechazo(fn () => $this->servicio(static fn (): string => json_encode([
            'success'  => true,
            'action'   => 'registro_empresa',
            'hostname' => 'example.test',
        ]))->verificar('token', 'auth'));
    }

    public function testRechazaHostnameAusenteONoAutorizado(): void
    {
        foreach ([
            ['success' => true, 'action' => 'auth'],
            ['success' => true, 'action' => 'auth', 'hostname' => 'otro.test'],
        ] as $respuesta) {
            $this->rechazo(fn () => $this->servicio(
                static fn (): string => json_encode($respuesta),
            )->verificar('token', 'auth'));
        }
    }

    public function testRechazaRespuestasInvalidasYErroresDeTransporte(): void
    {
        $respuestas = [
            null,
            '',
            'no-es-json',
            json_encode(['success' => false, 'error-codes' => ['invalid-input-response']]),
            json_encode(['action' => 'auth', 'hostname' => 'example.test']),
        ];

        foreach ($respuestas as $respuesta) {
            $this->rechazo(fn () => $this->servicio(
                static fn (): ?string => $respuesta,
            )->verificar('token', 'auth'));
        }

        $this->rechazo(fn () => $this->servicio(
            static function (): never {
                throw new \RuntimeException('transporte caído');
            },
        )->verificar('token', 'auth'));
    }
}
