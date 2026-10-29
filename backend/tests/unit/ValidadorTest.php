<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Libraries\Identidad;
use App\Validation\Validador;
use PHPUnit\Framework\TestCase;

/**
 * Pruebas unitarias del Validador (RT-22): reglas planas de la API.
 */
final class ValidadorTest extends TestCase
{
    public function testCampoObligatorio(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Hay errores en los datos enviados.');
        Validador::validar([], ['username' => ['required']]);
    }

    public function testRucYdniValidos(): void
    {
        // No debe lanzar excepción.
        Validador::validar(['ruc' => '20601234567'], ['ruc' => ['required', 'ruc']]);
        Validador::validar(['dni' => '12345678'], ['dni' => ['required', 'dni']]);

        $this->expectException(ApiException::class);
        Validador::validar(['ruc' => '2060'], ['ruc' => ['ruc']]);
    }

    public function testTelefonoAceptaSoloNueveUOnceDigitos(): void
    {
        // Válidos: 9 u 11 dígitos; vacío no se valida (campo opcional).
        Validador::validar(['telefono' => '987654321'], ['telefono' => ['telefono']]);
        Validador::validar(['telefono' => '51987654321'], ['telefono' => ['telefono']]);
        Validador::validar(['telefono' => ''], ['telefono' => ['telefono']]);

        foreach (['12345678', '1234567890', '123456789012', '98765432a'] as $invalido) {
            try {
                Validador::validar(['telefono' => $invalido], ['telefono' => ['telefono']]);
                $this->fail("El teléfono {$invalido} debió ser rechazado.");
            } catch (ApiException $e) {
                $this->assertSame(422, $e->getHttpCode());
            }
        }
    }

    public function testNoSeAceptaUnCeroCeroInternacionalComoTelefonoNacional(): void
    {
        $normalizado = Identidad::telefono('0033123456789');

        $this->assertSame('0033123456789', $normalizado);

        try {
            Validador::validar(['telefono' => $normalizado], ['telefono' => ['telefono']]);
            $this->fail('El número internacional no debe aceptarse como teléfono nacional.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getHttpCode());
        }
    }

    public function testCorreoInvalido(): void
    {        try {
            Validador::validar(['email' => 'no-es-correo'], ['email' => ['email']]);
            $this->fail('Debió lanzar ApiException.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getHttpCode());
            $this->assertNotEmpty($e->getErrores());
        }
    }

    public function testLongitudMinimaYMaxima(): void
    {
        $this->expectException(ApiException::class);
        Validador::validar(['password' => 'corta'], ['password' => ['min:8']]);

        $this->expectException(ApiException::class);
        Validador::validar(['nombre' => str_repeat('a', 30)], ['nombre' => ['max:20']]);
    }

    public function testEnumPermitido(): void
    {
        $this->expectException(ApiException::class);
        Validador::validar(['rol' => 'superusuario'], ['rol' => ['enum:admin,empresa,postulante']]);
    }

    public function testConfirmacion(): void
    {
        $this->expectException(ApiException::class);
        Validador::validar(
            ['password' => 'ClaveSegura1', 'password2' => 'OtraClave1'],
            ['password2' => ['igual:password']],
        );
    }

    public function testAceptacionDeTerminosEsEstricta(): void
    {
        // Solo el booleano JSON true representa una aceptación válida.
        Validador::validar(
            ['terms_accepted' => true],
            ['terms_accepted' => ['required', 'aceptacion']],
        );

        foreach ([null, false, 0, 1, 'true', '1', 'false', 'acepto'] as $invalido) {
            try {
                Validador::validar(
                    ['terms_accepted' => $invalido],
                    ['terms_accepted' => ['required', 'aceptacion']],
                );
                $this->fail('La aceptación inválida debió ser rechazada: ' . var_export($invalido, true));
            } catch (ApiException $e) {
                $this->assertSame(422, $e->getHttpCode());
            }
        }
    }

    public function testAceptacionAusenteEsRechazada(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Hay errores en los datos enviados.');
        Validador::validar([], ['terms_accepted' => ['required', 'aceptacion']]);
    }

    public function testPoliticaDeContrasena(): void
    {
        foreach (['abc', 'abcdefgh', 'abcdefg1', 'abcdefg@'] as $invalida) {
            try {
                Validador::validar(['password' => $invalida], ['password' => ['required', 'password']]);
                $this->fail('Debió rechazarse la contraseña de prueba.');
            } catch (ApiException $e) {
                $this->assertSame(422, $e->getHttpCode());
            }
        }

        foreach (['Abcdefg1@', 'Abcdefg1-', 'Abcdefg1_', 'Abcdefg1/'] as $valida) {
            Validador::validar(['password' => $valida], ['password' => ['required', 'password']]);
        }
    }

    public function testEspaciosCuentanComoVacioEnObligatorio(): void
    {
        foreach (['', '   ', "\t\n "] as $soloEspacios) {
            try {
                Validador::validar(['puesto' => $soloEspacios], ['puesto' => ['required', 'max:150']]);
                $this->fail('Un obligatorio con solo espacios debió ser rechazado.');
            } catch (ApiException $e) {
                $this->assertSame(422, $e->getHttpCode());
            }
        }

        // Texto real (con espacios alrededor) sigue siendo válido.
        Validador::validar(['puesto' => '  Analista  '], ['puesto' => ['required', 'max:150']]);
    }

    public function testEspaciosNoDisparanReglasDeFormatoEnCamposOpcionales(): void
    {
        // Un opcional con solo espacios se trata como vacío: no evalúa 'email'.
        $valido = true;
        try {
            Validador::validar(['email' => '   '], ['email' => ['email']]);
        } catch (ApiException) {
            $valido = false;
        }
        $this->assertTrue($valido, 'Un campo opcional con solo espacios no debe evaluarse como formato.');
    }

    public function testErroresConservanElMapaDeCampos(): void
    {
        try {
            Validador::validar(['email' => 'no-es-correo'], ['email' => ['email']]);
            $this->fail('Debió lanzar ApiException.');
        } catch (ApiException $e) {
            $this->assertSame(
                ['email' => 'El campo Email debe ser un correo válido.'],
                $e->getCampos(),
            );
            $this->assertSame(['El campo Email debe ser un correo válido.'], $e->getErrores());
        }
    }
}
