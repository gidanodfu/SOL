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

/**
 * La validación de los registros públicos debe ejecutarse antes de cualquier
 * acceso a persistencia. Las dependencias se simulan para comprobar únicamente
 * la barrera de entrada del servicio.
 */
final class RegistroValidacionTest extends TestCase
{
    private function auth(): AuthService
    {
        return new AuthService(
            $this->createMock(UserModel::class),
            $this->createMock(PostulanteModel::class),
            $this->createMock(RefreshTokenModel::class),
            $this->createMock(JwtService::class),
            $this->createMock(AuditoriaService::class),
            $this->createMock(PostulanteRepository::class),
            $this->createMock(TurnstileService::class),
            $this->createMock(IdentidadService::class),
        );
    }

    private function solicitudes(): SolicitudEmpresaService
    {
        return new SolicitudEmpresaService(
            $this->createMock(SolicitudEmpresaRepository::class),
            $this->createMock(SolicitudEmpresaModel::class),
            $this->createMock(ActivacionModel::class),
            $this->createMock(UserModel::class),
            $this->createMock(EmpresaModel::class),
            $this->createMock(AuditoriaService::class),
            $this->createMock(EmailService::class),
            $this->createMock(RucService::class),
            $this->createMock(IdentidadService::class),
        );
    }

    /**
     * @param callable(): mixed $accion
     */
    private function errorDeValidacion(callable $accion): ApiException
    {
        try {
            $accion();
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getHttpCode());

            return $e;
        }

        $this->fail('La solicitud inválida debió ser rechazada antes de persistir.');
    }

    public function testRegistroPostulanteRechazaTodosLosCamposObligatoriosVacios(): void
    {
        $e = $this->errorDeValidacion(fn () => $this->auth()->registrarPostulante([]));

        foreach (['dni', 'nombres', 'apellidos', 'email', 'telefono', 'password', 'password2', 'terms_accepted'] as $campo) {
            $this->assertArrayHasKey($campo, $e->getCampos(), "Falta el error del campo {$campo}");
        }

        $this->assertSame('El campo Email es obligatorio.', $e->getCampos()['email']);
        $this->assertSame('El campo Telefono es obligatorio.', $e->getCampos()['telefono']);
        $this->assertSame(
            'Debe aceptar los Términos y Condiciones para continuar.',
            $e->getCampos()['terms_accepted'],
        );
    }

    public function testRegistroPostulanteRechazaEspaciosYFormatosInvalidos(): void
    {
        $e = $this->errorDeValidacion(fn () => $this->auth()->registrarPostulante([
            'dni'            => '123',
            'nombres'        => '   ',
            'apellidos'      => "\t\n",
            'email'          => 'no-es-correo',
            'telefono'       => '12345678',
            'password'       => 'corta',
            'password2'      => 'diferente',
            'terms_accepted' => false,
        ]));

        foreach (['dni', 'nombres', 'apellidos', 'email', 'telefono', 'password', 'password2', 'terms_accepted'] as $campo) {
            $this->assertArrayHasKey($campo, $e->getCampos(), "Falta el error del campo {$campo}");
        }
    }

    public function testTokenDeDniQuedaVinculadoAlDocumento(): void
    {
        $jwt = new JwtService();
        $token = $jwt->crearTokenVerificacionDni('12345678');
        $payload = $jwt->verificar($token);

        $this->assertIsArray($payload);
        $this->assertSame('verificacion_dni', $payload['tipo']);
        $this->assertSame('12345678', $payload['dni']);
        $this->assertGreaterThan(time(), $payload['exp']);
    }

    public function testRegistroPostulanteExigeTokenDeVerificacionDni(): void
    {
        $jwt = new JwtService();
        $auth = new AuthService(
            $this->createMock(UserModel::class),
            $this->createMock(PostulanteModel::class),
            $this->createMock(RefreshTokenModel::class),
            $jwt,
            $this->createMock(AuditoriaService::class),
            $this->createMock(PostulanteRepository::class),
            $this->createMock(TurnstileService::class),
            $this->createMock(IdentidadService::class),
        );

        $e = $this->errorDeValidacion(fn () => $auth->registrarPostulante([
            'dni'            => '12345678',
            'nombres'        => 'Ana',
            'apellidos'      => 'Torres',
            'email'          => 'ana@example.pe',
            'telefono'       => '987654321',
            'password'       => 'Clave123!',
            'password2'      => 'Clave123!',
            'terms_accepted' => true,
        ]));

        $this->assertSame('Debe verificar el DNI antes de crear la cuenta.', $e->getCampos()['dni_token']);
    }

    public function testRegistroPostulanteRechazaTokenDeOtroDni(): void
    {
        $jwt = new JwtService();
        $auth = new AuthService(
            $this->createMock(UserModel::class),
            $this->createMock(PostulanteModel::class),
            $this->createMock(RefreshTokenModel::class),
            $jwt,
            $this->createMock(AuditoriaService::class),
            $this->createMock(PostulanteRepository::class),
            $this->createMock(TurnstileService::class),
            $this->createMock(IdentidadService::class),
        );
        $tokenDeOtroDni = $jwt->crearTokenVerificacionDni('87654321');

        $e = $this->errorDeValidacion(fn () => $auth->registrarPostulante([
            'dni'            => '12345678',
            'nombres'        => 'Ana',
            'apellidos'      => 'Torres',
            'email'          => 'ana@example.pe',
            'telefono'       => '987654321',
            'password'       => 'Clave123!',
            'password2'      => 'Clave123!',
            'terms_accepted' => true,
            'dni_token'      => $tokenDeOtroDni,
        ]));

        $this->assertSame('Debe verificar el DNI antes de crear la cuenta.', $e->getCampos()['dni_token']);
    }

    public function testSolicitudEmpresaRechazaTodosLosCamposObligatoriosVacios(): void
    {
        $e = $this->errorDeValidacion(fn () => $this->solicitudes()->solicitar([]));

        foreach (['ruc', 'email', 'telefono', 'representante', 'terms_accepted'] as $campo) {
            $this->assertArrayHasKey($campo, $e->getCampos(), "Falta el error del campo {$campo}");
        }

        $this->assertSame('El campo Email es obligatorio.', $e->getCampos()['email']);
        $this->assertSame('El campo Telefono es obligatorio.', $e->getCampos()['telefono']);
    }

    public function testSolicitudEmpresaRechazaEspaciosYFormatosInvalidos(): void
    {
        $e = $this->errorDeValidacion(fn () => $this->solicitudes()->solicitar([
            'ruc'            => '2060',
            'email'          => 'sin-arroba',
            'telefono'       => '123',
            'representante'  => '   ',
            'terms_accepted' => false,
        ]));

        foreach (['ruc', 'email', 'telefono', 'representante', 'terms_accepted'] as $campo) {
            $this->assertArrayHasKey($campo, $e->getCampos(), "Falta el error del campo {$campo}");
        }
    }
}
