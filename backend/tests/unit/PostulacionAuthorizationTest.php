<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Models\CvModel;
use App\Models\PostulacionModel;
use App\Repositories\OfertaRepository;
use App\Repositories\PostulacionRepository;
use App\Repositories\PostulanteRepository;
use App\Services\PostulacionService;
use App\Services\StorageService;
use PHPUnit\Framework\TestCase;

/**
 * Regresión de autorización por empresa (RT-05/RT-CV-04): todas las consultas
 * por ID deben entregar el empresa_id de la sesión al repositorio. Si la fila
 * no pertenece a esa empresa, el servicio debe responder 404 y no exponerla.
 */
final class PostulacionAuthorizationTest extends TestCase
{
    private function servicioConPropiedad(?array $fila): PostulacionService
    {
        $repo = $this->createMock(PostulacionRepository::class);
        $repo->expects($this->once())
            ->method('deEmpresaPorId')
            ->with(2, 10)
            ->willReturn($fila);

        return new PostulacionService(
            $this->createMock(PostulacionModel::class),
            $repo,
            $this->createMock(OfertaRepository::class),
            $this->createMock(PostulanteRepository::class),
            $this->createMock(CvModel::class),
            $this->createMock(StorageService::class),
        );
    }

    public function testDetalleDeOtraEmpresaNoSeExpone(): void
    {
        $this->expectException(ApiException::class);
        $this->servicioConPropiedad(null)->detalleDeEmpresa(2, 10);
    }

    public function testUrlCvDeOtraEmpresaNoSeGenera(): void
    {
        $this->expectException(ApiException::class);
        $this->servicioConPropiedad(null)->urlCvAutorizada(2, 10);
    }

    public function testArchivoCvDeOtraEmpresaNoSeEntrega(): void
    {
        $this->expectException(ApiException::class);
        $this->servicioConPropiedad(null)->archivoCvAutorizado(2, 10, 'x');
    }

    public function testCambioDeEstadoDeOtraEmpresaNoSeAplica(): void
    {
        $this->expectException(ApiException::class);
        $this->servicioConPropiedad(null)->cambiarEstadoDeEmpresa(2, 10, 'en_revision');
    }

    public function testActivacionDeOtraEmpresaNoSeAplica(): void
    {
        $this->expectException(ApiException::class);
        $this->servicioConPropiedad(null)->cambiarActivacionDeEmpresa(2, 10, true);
    }
}
