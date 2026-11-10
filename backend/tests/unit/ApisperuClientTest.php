<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\ApisperuClient;
use PHPUnit\Framework\TestCase;

/**
 * Cliente HTTP de APIsPERU con transporte simulado: no contacta el proveedor
 * ni usa credenciales reales.
 */
final class ApisperuClientTest extends TestCase
{
    private const TOKEN = 'token-de-prueba-no-real';

    /** @var list<string> */
    private array $claves = ['apisperu.baseURL', 'apisperu.token', 'apisperu.timeout'];

    protected function setUp(): void
    {
        $this->setEnv('apisperu.baseURL', 'https://dniruc.apisperu.com/api/v1');
        $this->setEnv('apisperu.token', self::TOKEN);
        $this->setEnv('apisperu.timeout', '10');
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

    private function cliente(callable $transporte): ApisperuClient
    {
        return new ApisperuClient($transporte);
    }

    private function rechazo(callable $accion, int $estado = 400): ApiException
    {
        try {
            $accion();
        } catch (ApiException $e) {
            $this->assertSame($estado, $e->getHttpCode());

            return $e;
        }

        $this->fail('La consulta debía rechazarse.');
    }

    public function testConsultaDniConBearerSinTokenEnLaUrl(): void
    {
        $capturado = null;
        $cliente = $this->cliente(function (string $url, array $headers, int $timeout) use (&$capturado): array {
            $capturado = compact('url', 'headers', 'timeout');

            return ['status' => 200, 'body' => json_encode([
                'dni'             => '12345678',
                'nombres'         => 'JUAN CARLOS',
                'apellidoPaterno' => 'PEREZ',
                'apellidoMaterno' => 'GARCIA',
            ])];
        });

        $datos = $cliente->consultarDni('12345678');

        $this->assertSame('JUAN CARLOS', $datos['nombres']);
        $this->assertSame('https://dniruc.apisperu.com/api/v1/dni/12345678', $capturado['url']);
        $this->assertContains('Authorization: Bearer ' . self::TOKEN, $capturado['headers']);
        $this->assertStringNotContainsString(self::TOKEN, $capturado['url']);
        $this->assertSame(10, $capturado['timeout']);
    }

    public function testConsultaRucConstruyeLaRutaCorrecta(): void
    {
        $capturado = null;
        $cliente = $this->cliente(function (string $url, array $headers, int $timeout) use (&$capturado): array {
            $capturado = compact('url', 'headers', 'timeout');

            return ['status' => 200, 'body' => json_encode(['razonSocial' => 'EMPRESA DEMO S.A.C.'])];
        });

        $cliente->consultarRuc('20123456789');

        $this->assertSame('https://dniruc.apisperu.com/api/v1/ruc/20123456789', $capturado['url']);
        $this->assertContains('Accept: application/json', $capturado['headers']);
    }

    public function testRespuestaSuccessFalseSeRechazaSinExponerElMensaje(): void
    {
        $e = $this->rechazo(fn () => $this->cliente(
            static fn (): array => ['status' => 200, 'body' => json_encode([
                'success' => false,
                'message' => 'Token inválido o vencido',
            ])],
        )->consultarDni('12345678'));

        $this->assertStringNotContainsString('Token inválido', $e->getMessage());
        $this->assertStringNotContainsString(self::TOKEN, $e->getMessage());
    }

    public function testErroresHttpSeMapeanSinFiltrarCredenciales(): void
    {
        $casos = [
            401 => 400,
            403 => 400,
            404 => 400,
            422 => 400,
            429 => 429,
            500 => 400,
        ];

        foreach ($casos as $http => $esperado) {
            $e = $this->rechazo(fn () => $this->cliente(
                static fn (): array => ['status' => $http, 'body' => ''],
            )->consultarDni('12345678'), $esperado);

            $this->assertStringNotContainsString(self::TOKEN, $e->getMessage(), "HTTP {$http}");
        }
    }

    public function testJsonInvalidoOIncompletoSeRechaza(): void
    {
        foreach (['no-es-json', '', '{}'] as $cuerpo) {
            $this->rechazo(fn () => $this->cliente(
                static fn (): array => ['status' => 200, 'body' => $cuerpo],
            )->consultarRuc('20123456789'));
        }
    }

    public function testFalloDeTransporteSeConvierteEnErrorControlado(): void
    {
        $e = $this->rechazo(fn () => $this->cliente(
            static function (): never {
                throw new \RuntimeException('timeout con ' . self::TOKEN);
            },
        )->consultarDni('12345678'));

        $this->assertStringNotContainsString(self::TOKEN, $e->getMessage());
        $this->assertStringNotContainsString('timeout', $e->getMessage());
    }

    public function testSinTokenNoSeLlamaAlProveedor(): void
    {
        $this->setEnv('apisperu.token', '');

        $llamado = false;
        $e = $this->rechazo(function () use (&$llamado): void {
            $this->cliente(function () use (&$llamado): array {
                $llamado = true;

                return ['status' => 200, 'body' => '{}'];
            })->consultarRuc('20123456789');
        });

        $this->assertFalse($llamado);
        $this->assertStringNotContainsString(self::TOKEN, $e->getMessage());
    }

    public function testBaseUrlPersonalizadaYTimeoutPorDefecto(): void
    {
        $this->setEnv('apisperu.baseURL', 'https://ejemplo.test/api/v1/');
        $this->setEnv('apisperu.timeout', '0');

        $capturado = null;
        $this->cliente(function (string $url, array $headers, int $timeout) use (&$capturado): array {
            $capturado = compact('url', 'timeout');

            return ['status' => 200, 'body' => json_encode(['nombres' => 'ANA'])];
        })->consultarDni('12345678');

        $this->assertSame('https://ejemplo.test/api/v1/dni/12345678', $capturado['url']);
        $this->assertSame(10, $capturado['timeout']);
    }
}
