<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\ActivacionModel;
use App\Models\EmpresaModel;
use App\Models\PostulanteModel;
use App\Models\RefreshTokenModel;
use App\Models\SolicitudEmpresaModel;
use App\Models\UserModel;
use App\Repositories\PostulanteRepository;
use App\Repositories\SolicitudEmpresaRepository;
use App\Services\AuditoriaService;
use App\Services\AuthService;
use App\Services\EmailService;
use App\Services\IdentidadService;
use App\Services\JwtService;
use App\Services\RucService;
use App\Services\SolicitudEmpresaService;
use App\Services\TurnstileService;
use PHPUnit\Framework\TestCase;

final class TurnstileFlowsTest extends TestCase
{
    private function turnstileQueRechaza(): TurnstileService
    {
        $turnstile = $this->createMock(TurnstileService::class);
        $turnstile->method('habilitado')->willReturn(true);
        $turnstile->method('verificar')->willThrowException(
            ApiException::validacion('No se pudo verificar la seguridad de la solicitud.'),
        );

        return $turnstile;
    }

    private function auth(TurnstileService $turnstile): AuthService
    {
        return new AuthService(
            $this->createMock(UserModel::class),
            $this->createMock(PostulanteModel::class),
            $this->createMock(RefreshTokenModel::class),
            new JwtService(),
            $this->createMock(AuditoriaService::class),
            $this->createMock(PostulanteRepository::class),
            $turnstile,
            $this->createMock(IdentidadService::class),
        );
    }

    private function solicitudes(TurnstileService $turnstile, RucService $ruc): SolicitudEmpresaService
    {
        return new SolicitudEmpresaService(
            $this->createMock(SolicitudEmpresaRepository::class),
            $this->createMock(SolicitudEmpresaModel::class),
            $this->createMock(ActivacionModel::class),
            $this->createMock(UserModel::class),
            $this->createMock(EmpresaModel::class),
            $this->createMock(AuditoriaService::class),
            $this->createMock(EmailService::class),
            $ruc,
            $this->createMock(IdentidadService::class),
            $turnstile,
        );
    }

    private function rechazo(callable $accion): void
    {
        try {
            $accion();
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getHttpCode());

            return;
        }

        $this->fail('Turnstile debía rechazar la operación.');
    }

    public function testRegistroPostulanteRechazaAntesDePersistir(): void
    {
        $jwt = new JwtService();
        $datos = [
            'dni'            => '12345678',
            'nombres'        => 'Ana',
            'apellidos'      => 'Torres',
            'email'          => 'ana@example.pe',
            'telefono'       => '987654321',
            'password'       => 'Clave123!',
            'password2'      => 'Clave123!',
            'terms_accepted' => true,
            'dni_token'      => $jwt->crearTokenVerificacionDni('12345678', 'Ana', 'Torres'),
            'turnstile_token' => 'token-invalido',
        ];

        $this->rechazo(fn () => $this->auth($this->turnstileQueRechaza())->registrarPostulante($datos));
    }

    public function testGoogleRechazaAntesDeConsultarElIdToken(): void
    {
        putenv('google.clientId=test-client');
        $_ENV['google.clientId'] = 'test-client';
        $_SERVER['google.clientId'] = 'test-client';

        try {
            $this->rechazo(fn () => $this->auth($this->turnstileQueRechaza())->autenticarConGoogle('id-token', 'token-invalido'));
        } finally {
            putenv('google.clientId');
            unset($_ENV['google.clientId'], $_SERVER['google.clientId']);
        }
    }

    public function testSolicitudEmpresaRechazaSinConsultarSunat(): void
    {
        $ruc = $this->createMock(RucService::class);
        $ruc->expects($this->never())->method('consultar');

        $this->rechazo(fn () => $this->solicitudes($this->turnstileQueRechaza(), $ruc)->solicitar([
            'ruc'            => '20123456789',
            'email'          => 'empresa@example.pe',
            'telefono'       => '987654321',
            'representante'  => 'Ana Torres',
            'terms_accepted' => true,
            'turnstile_token' => 'token-invalido',
        ]));
    }
}
