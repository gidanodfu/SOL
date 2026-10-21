<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\OfertaService;
use PHPUnit\Framework\TestCase;

final class OfertaVencimientoTest extends TestCase
{
    public function testFechaDeCierreSeInterpretaPorDiaLocalYEsInclusiva(): void
    {
        $this->assertFalse(OfertaService::vencida(null, '2026-10-21'));
        $this->assertFalse(OfertaService::vencida('2026-10-22', '2026-10-21'));
        $this->assertFalse(OfertaService::vencida('2026-10-21', '2026-10-21'));
        $this->assertTrue(OfertaService::vencida('2026-10-20', '2026-10-21'));
        $this->assertTrue(OfertaService::vencida('2026-10-21', '2026-10-22'));
    }

    public function testCorteDeFechaEnAmericaLima(): void
    {
        $zona = new \DateTimeZone('America/Lima');
        $cierre = '2026-10-21';
        $antesDeMedianoche = new \DateTimeImmutable('2026-10-21 23:59:59', $zona);
        $medianoche = new \DateTimeImmutable('2026-10-22 00:00:00', $zona);

        $this->assertFalse(OfertaService::vencida($cierre, $antesDeMedianoche->format('Y-m-d')));
        $this->assertTrue(OfertaService::vencida($cierre, $medianoche->format('Y-m-d')));
    }
}
