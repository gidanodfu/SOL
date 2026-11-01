<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Services\HtmlSanitizer;
use App\Services\OportunidadService;
use PHPUnit\Framework\TestCase;

/**
 * Ciclo de vida efectivo de oportunidades en America/Lima, con los mismos
 * límites inclusivos que el módulo de actividades.
 */
final class OportunidadVencimientoTest extends TestCase
{
    public function testUnInstanteAntesDelInicioEstaProgramada(): void
    {
        self::assertSame('programado', OportunidadService::estadoEfectivo([
            'estado'       => 'programado',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-01 09:59:59'));
    }

    public function testInicioExactoPasaAEnCurso(): void
    {
        self::assertSame('en_curso', OportunidadService::estadoEfectivo([
            'estado'       => 'programado',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-01 10:00:00'));
    }

    public function testUnInstanteAntesDelFinSigueEnCurso(): void
    {
        self::assertSame('en_curso', OportunidadService::estadoEfectivo([
            'estado'       => 'en_curso',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-01 11:59:59'));
    }

    public function testFinExactoYaEstaFinalizada(): void
    {
        self::assertSame('finalizado', OportunidadService::estadoEfectivo([
            'estado'       => 'en_curso',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-01 12:00:00'));
    }

    public function testDespuesDelFinEstaFinalizada(): void
    {
        self::assertSame('finalizado', OportunidadService::estadoEfectivo([
            'estado'       => 'programado',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-02 00:00:00'));
    }

    public function testFinalizacionManualSeConservaAunqueLasFechasSeanFuturas(): void
    {
        self::assertSame('finalizado', OportunidadService::estadoEfectivo([
            'estado'       => 'finalizado',
            'fecha_inicio' => '2027-01-01 10:00:00',
            'fecha_fin'    => '2027-01-02 12:00:00',
        ], '2026-11-01 12:00:00'));
    }

    public function testCanceladoSeConservaYNoSePublica(): void
    {
        self::assertSame('cancelado', OportunidadService::estadoEfectivo([
            'estado'       => 'cancelado',
            'fecha_inicio' => '2026-11-01 10:00:00',
            'fecha_fin'    => '2027-01-02 12:00:00',
        ], '2026-11-01 12:00:00'));
    }

    public function testRegistroHistoricoSinFechasEsProgramadoYModificable(): void
    {
        $fila = [
            'estado'       => 'programado',
            'fecha_inicio' => null,
            'fecha_fin'    => null,
            'modalidad'    => null,
        ];

        self::assertSame('programado', OportunidadService::estadoEfectivo($fila, '2026-11-01 12:00:00'));
        self::assertTrue(OportunidadService::puedeModificarse($fila, '2026-11-01 12:00:00'));
    }

    public function testPuedeModificarseEsFalsoAlFinalizarManualOPorFecha(): void
    {
        self::assertFalse(OportunidadService::puedeModificarse([
            'estado'       => 'finalizado',
            'fecha_fin'    => '2027-01-01 10:00:00',
        ], '2026-11-01 12:00:00'));

        self::assertFalse(OportunidadService::puedeModificarse([
            'estado'       => 'en_curso',
            'fecha_fin'    => '2026-11-01 12:00:00',
        ], '2026-11-01 12:00:00'));

        self::assertTrue(OportunidadService::puedeModificarse([
            'estado'       => 'en_curso',
            'fecha_fin'    => '2026-11-01 12:00:01',
        ], '2026-11-01 12:00:00'));
    }

    public function testExigirModificableDevuelveElCodigoEstable(): void
    {
        $servicio = new OportunidadService(
            $this->createMock(OportunidadModel::class),
            new HtmlSanitizer(),
        );

        try {
            $servicio->exigirModificable([
                'estado'    => 'programado',
                'fecha_fin' => '2020-01-01 00:00:00',
            ]);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(409, $e->getHttpCode());
            self::assertSame(OportunidadService::CODIGO_FINALIZADA, $e->getCodigo());
            self::assertSame('OPPORTUNITY_ALREADY_FINALIZED', $e->getCodigo());
        }
    }
}
