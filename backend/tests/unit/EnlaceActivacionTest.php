<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\SolicitudEmpresaService;
use PHPUnit\Framework\TestCase;

/**
 * Construcción configurable del enlace de activación (APP_URL). Verifica que la
 * URL dependa del entorno y no de un dominio hardcodeado, y que se normalice la
 * barra final (sin "//").
 */
final class EnlaceActivacionTest extends TestCase
{
    public function testDesarrolloLocalhost(): void
    {
        $this->assertSame(
            'http://localhost:5173/activar-cuenta/TOKEN',
            SolicitudEmpresaService::enlaceActivacion('http://localhost:5173', 'TOKEN'),
        );
    }

    public function testProduccionNormalizaBarraFinal(): void
    {
        $this->assertSame(
            'https://empleo.ejemplo.gob.pe/activar-cuenta/TOKEN',
            SolicitudEmpresaService::enlaceActivacion('https://empleo.ejemplo.gob.pe/', 'TOKEN'),
        );
    }
}
