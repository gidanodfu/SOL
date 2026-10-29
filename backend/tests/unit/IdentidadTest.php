<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Libraries\Identidad;
use PHPUnit\Framework\TestCase;

final class IdentidadTest extends TestCase
{
    public function testNormalizaEmail(): void
    {
        $this->assertSame('persona@ejemplo.pe', Identidad::email('  Persona@Ejemplo.PE '));
        $this->assertNull(Identidad::email('   '));
        $this->assertNull(Identidad::email(null));
    }

    public function testNormalizaTelefonoAlFormatoNacional(): void
    {
        $this->assertSame('987654321', Identidad::telefono('987654321'));
        $this->assertSame('987654321', Identidad::telefono('+51 987-654-321'));
        $this->assertSame('987654321', Identidad::telefono('51987654321'));
        $this->assertSame('987654321', Identidad::telefono('0051 987654321'));
        $this->assertSame('957418741', Identidad::telefono('00957418741'));
        $this->assertSame('957418741', Identidad::telefono('0051 957 418 741'));
        $this->assertSame('957418741', Identidad::telefono('(957) 418-741'));
        $this->assertNull(Identidad::telefono(''));
    }

    public function testNoEliminaCeroCeroDeNumerosDeOtraLongitud(): void
    {
        // Solo se retira 00 cuando el resto son exactamente 9 dígitos.
        $this->assertSame('0033123456789', Identidad::telefono('0033123456789'));
        $this->assertSame('005195741874', Identidad::telefono('0051 957 418 74'));
    }

    public function testNormalizaRucYDniSoloConSeparadoresPermitidos(): void
    {
        $this->assertSame('20601234567', Identidad::ruc('20-601234567'));
        $this->assertSame('20601234567', Identidad::ruc('20.601.234.567'));
        $this->assertSame('12345678', Identidad::dni('12.345.678'));
        $this->assertSame('12345678', Identidad::dni('12-345-678'));
    }

    public function testTipoDeIdentificadorDeLogin(): void
    {
        $this->assertSame('ruc', Identidad::tipoLogin('20-601234567'));
        $this->assertSame('dni', Identidad::tipoLogin('12.345.678'));
        $this->assertSame('email', Identidad::tipoLogin('Persona@Ejemplo.pe'));
        $this->assertSame('usuario', Identidad::tipoLogin('MDJLO-SOL'));
        $this->assertSame('20601234567', Identidad::normalizarLogin('20-601234567'));
        $this->assertSame('12345678', Identidad::normalizarLogin('12.345.678'));
    }
}
