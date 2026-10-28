<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Services\AutorizacionMunicipalService;
use PHPUnit\Framework\TestCase;

/**
 * Matriz central de perfiles municipales. El backend y el frontend consumen
 * esta lista mediante la sesión; no debe existir una segunda matriz divergente.
 */
final class AutorizacionMunicipalServiceTest extends TestCase
{
    public function testAdminConservaTodasLasFacultades(): void
    {
        $permisos = AutorizacionMunicipalService::permisosDe('admin');

        foreach ([
            'municipal.lectura',
            'usuarios',
            'empresas',
            'solicitudes',
            'ofertas',
            'actividades',
            'oportunidades',
            'reportes',
            'reportes_csv',
        ] as $permiso) {
            $this->assertContains($permiso, $permisos);
        }
    }

    public function testModeradorGestionaOperacionesPeroNoCuentasNiCsv(): void
    {
        $permisos = AutorizacionMunicipalService::permisosDe('moderador');

        $this->assertContains('municipal.lectura', $permisos);
        $this->assertContains('solicitudes', $permisos);
        $this->assertContains('ofertas', $permisos);
        $this->assertContains('actividades', $permisos);
        $this->assertContains('oportunidades', $permisos);
        $this->assertContains('reportes', $permisos);
        $this->assertNotContains('usuarios', $permisos);
        $this->assertNotContains('empresas', $permisos);
        $this->assertNotContains('reportes_csv', $permisos);
    }

    public function testSoloLecturaSoloPuedeConsultar(): void
    {
        $this->assertSame(
            ['municipal.lectura'],
            AutorizacionMunicipalService::permisosDe('solo_lectura'),
        );
    }

    public function testPerfilNuloOInvalidoNoRecibePermisos(): void
    {
        $this->assertSame([], AutorizacionMunicipalService::permisosDe(null));
        $this->assertSame([], AutorizacionMunicipalService::permisosDe('superadmin'));
        $this->assertSame([], AutorizacionMunicipalService::permisosDe(''));
    }

    public function testListaCanonicaDePerfiles(): void
    {
        $this->assertSame(
            ['admin', 'moderador', 'solo_lectura'],
            AutorizacionMunicipalService::perfiles(),
        );
    }
}
