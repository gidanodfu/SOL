<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
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

    public function testCorreoInvalido(): void
    {
        try {
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
}
