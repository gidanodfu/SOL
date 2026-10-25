<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\ActividadService;
use PHPUnit\Framework\TestCase;

final class ActividadVencimientoTest extends TestCase
{
    public function testFechaFinNulaNoVencePorSiSola(): void
    {
        $this->assertFalse(ActividadService::vencida(null, '2026-10-24 12:00:00'));
        $this->assertSame('en_curso', ActividadService::estadoEfectivo([
            'estado' => 'en_curso',
            'fecha_inicio' => '2026-10-20 09:00:00',
            'fecha_fin' => null,
        ], '2026-10-24 12:00:00'));
    }

    public function testFechaFinFuturaSigueVigente(): void
    {
        $this->assertFalse(ActividadService::vencida('2026-10-24 18:00:00', '2026-10-24 17:59:59'));
        $this->assertSame('en_curso', ActividadService::estadoEfectivo([
            'estado' => 'en_curso',
            'fecha_inicio' => '2026-10-20 09:00:00',
            'fecha_fin' => '2026-10-24 18:00:00',
        ], '2026-10-24 17:59:59'));
    }

    public function testFechaFinExactaYaSeConsideraVencida(): void
    {
        $this->assertTrue(ActividadService::vencida('2026-10-24 18:00:00', '2026-10-24 18:00:00'));
        $this->assertSame('finalizado', ActividadService::estadoEfectivo([
            'estado' => 'en_curso',
            'fecha_fin' => '2026-10-24 18:00:00',
        ], '2026-10-24 18:00:00'));
    }

    public function testFechaFinPasadaYEstadosManuales(): void
    {
        $this->assertTrue(ActividadService::vencida('2026-10-23 18:00:00', '2026-10-24 00:00:00'));
        $this->assertSame('finalizado', ActividadService::estadoEfectivo([
            'estado' => 'programado',
            'fecha_fin' => '2026-10-20 18:00:00',
        ], '2026-10-24 00:00:00'));
        $this->assertSame('cancelado', ActividadService::estadoEfectivo([
            'estado' => 'cancelado',
            'fecha_fin' => '2026-10-20 18:00:00',
        ], '2026-10-24 00:00:00'));
        $this->assertSame('finalizado', ActividadService::estadoEfectivo([
            'estado' => 'finalizado',
            'fecha_fin' => '2026-10-26 18:00:00',
        ], '2026-10-24 00:00:00'));
    }

    public function testActividadProgramadaConInicioPasadoSinFinEstaEnCurso(): void
    {
        $this->assertFalse(ActividadService::vencida(null, '2026-10-24 12:00:00'));
        $this->assertSame('en_curso', ActividadService::estadoEfectivo([
            'estado' => 'programado',
            'fecha_inicio' => '2026-10-20 09:00:00',
            'fecha_fin' => null,
        ], '2026-10-24 12:00:00'));
    }

    public function testActividadFuturaSigueProgramada(): void
    {
        $this->assertSame('programado', ActividadService::estadoEfectivo([
            'estado' => 'programado',
            'fecha_inicio' => '2026-10-25 09:00:00',
            'fecha_fin' => '2026-10-26 18:00:00',
        ], '2026-10-24 12:00:00'));
    }
}
