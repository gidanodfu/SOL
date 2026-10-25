<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\OfertaService;
use PHPUnit\Framework\TestCase;

/**
 * El catálogo de ubicaciones del backend debe coincidir con el del frontend
 * (validado también en `frontend/tests/ofertas.test.mjs`). El backend es la
 * autoridad final de la validación.
 */
final class OfertaCatalogoTest extends TestCase
{
    public function testCatalogoDeUbicacionesDelBackend(): void
    {
        $this->assertSame([
            'Chiclayo',
            'José Leonardo Ortiz',
            'La Victoria',
            'Pimentel',
            'Lambayeque',
        ], OfertaService::UBICACIONES);
        $this->assertSame(
            count(OfertaService::UBICACIONES),
            count(array_unique(OfertaService::UBICACIONES)),
        );
    }
}
