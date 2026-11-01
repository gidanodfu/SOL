<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\ActividadModel;
use App\Services\ActividadService;
use App\Services\HtmlSanitizer;
use App\Services\StorageService;
use PHPUnit\Framework\TestCase;

/**
 * Inmutabilidad de actividades finalizadas: por estado administrativo o por
 * fecha de fin alcanzada (America/Lima), incluso si el estado persistido es
 * anterior.
 */
final class ActividadInmutabilidadTest extends TestCase
{
    private function servicio(): ActividadService
    {
        return new ActividadService(
            $this->createMock(ActividadModel::class),
            new HtmlSanitizer(),
            $this->createMock(StorageService::class),
        );
    }

    public function testActividadesNoFinalizadasPuedenModificarse(): void
    {
        $ahora = '2026-10-31 09:00:00';

        self::assertTrue(ActividadService::puedeModificarse([
            'estado' => 'programado', 'fecha_fin' => '2026-11-01 18:00:00',
        ], $ahora));
        self::assertTrue(ActividadService::puedeModificarse([
            'estado' => 'en_curso', 'fecha_fin' => '2026-10-31 18:00:00',
        ], $ahora));
        self::assertTrue(ActividadService::puedeModificarse([
            'estado' => 'cancelado', 'fecha_fin' => '2026-11-01 18:00:00',
        ], $ahora));
        self::assertFalse(ActividadService::puedeModificarse([
            'estado' => 'cancelado', 'fecha_fin' => '2026-10-30 18:00:00',
        ], $ahora));
        self::assertTrue(ActividadService::puedeModificarse([
            'estado' => 'programado', 'fecha_fin' => null,
        ], $ahora));
    }

    public function testActividadFinalizadaPorEstadoEsInmutable(): void
    {
        self::assertFalse(ActividadService::puedeModificarse([
            'estado' => 'finalizado', 'fecha_fin' => '2026-12-31 23:59:59',
        ], '2026-10-31 09:00:00'));
    }

    public function testActividadFinalizadaPorFechaEsInmutableAunqueElEstadoSeaAnterior(): void
    {
        $ahora = '2026-10-31 09:00:00';

        self::assertFalse(ActividadService::puedeModificarse([
            'estado' => 'programado', 'fecha_fin' => '2026-10-31 08:59:59',
        ], $ahora));
        self::assertFalse(ActividadService::puedeModificarse([
            'estado' => 'en_curso', 'fecha_fin' => '2026-10-31 09:00:00',
        ], $ahora));
    }

    public function testExigirModificableDevuelveConflictoConCodigoEstable(): void
    {
        try {
            $this->servicio()->exigirModificable([
                'estado' => 'programado',
                'fecha_fin' => '2025-01-01 00:00:00',
            ]);
            self::fail('Se esperaba ApiException.');
        } catch (ApiException $e) {
            self::assertSame(409, $e->getHttpCode());
            self::assertSame('ACTIVITY_ALREADY_FINALIZED', $e->getCodigo());
            self::assertSame('La actividad ya ha finalizado y no puede modificarse.', $e->getMessage());
        }
    }

    public function testExigirModificablePermiteActividadVigente(): void
    {
        $this->servicio()->exigirModificable([
            'estado' => 'programado',
            'fecha_fin' => date('Y-m-d H:i:s', strtotime('+1 day')),
        ]);

        self::assertTrue(true);
    }
}
