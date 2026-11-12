<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\ContratacionService;
use PHPUnit\Framework\TestCase;

/**
 * Normalización de fecha_situacion: el frontend envía "" cuando el usuario no
 * indica fecha. Nunca debe llegar una cadena vacía a una columna DATE.
 */
final class ContratacionFechaSituacionTest extends TestCase
{
    public function testRegistroSinFechaUsaFechaDeContratacion(): void
    {
        $this->assertSame(
            '2026-11-01',
            ContratacionService::resolverFechaSituacionRegistro('', '2026-11-01'),
        );
        $this->assertSame(
            '2026-11-01',
            ContratacionService::resolverFechaSituacionRegistro(null, '2026-11-01'),
        );
    }

    public function testEdicionConCambioSinFechaUsaHoy(): void
    {
        $this->assertSame(
            '2026-11-12',
            ContratacionService::resolverFechaSituacionEdicion(
                '',
                '2026-10-01',
                'despedido',
                'contratado',
                '2026-11-12',
            ),
        );
    }

    public function testEdicionSinCambioConservaLaFechaHistorica(): void
    {
        $this->assertSame(
            '2026-10-01',
            ContratacionService::resolverFechaSituacionEdicion(
                '',
                '2026-10-01',
                'contratado',
                'contratado',
                '2026-11-12',
            ),
        );
        $this->assertNull(
            ContratacionService::resolverFechaSituacionEdicion(
                '',
                null,
                'contratado',
                'contratado',
                '2026-11-12',
            ),
        );
        $this->assertNull(
            ContratacionService::resolverFechaSituacionEdicion(
                '',
                '0000-00-00',
                'contratado',
                'contratado',
                '2026-11-12',
            ),
            'Una fecha cero histórica no debe conservarse',
        );
    }

    public function testFechaExplicitaTienePrioridad(): void
    {
        $this->assertSame(
            '2026-11-05',
            ContratacionService::resolverFechaSituacionEdicion(
                '2026-11-05',
                '2026-10-01',
                'renuncio',
                'contratado',
                '2026-11-12',
            ),
        );
    }
}
