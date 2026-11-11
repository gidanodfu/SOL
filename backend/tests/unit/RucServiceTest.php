<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\ApisperuClient;
use App\Services\RucService;
use PHPUnit\Framework\TestCase;

final class RucServiceTest extends TestCase
{
    private function servicio(array $respuesta): RucService
    {
        $cliente = $this->createMock(ApisperuClient::class);
        $cliente->method('consultarRuc')->willReturn($respuesta);

        return new RucService($cliente);
    }

    /** @param callable(): mixed $accion */
    private function rechazo(callable $accion, int $estado = 400): ApiException
    {
        try {
            $accion();
        } catch (ApiException $e) {
            $this->assertSame($estado, $e->getHttpCode());

            return $e;
        }

        $this->fail('La consulta debía rechazarse.');
    }

    public function testMapeaRazonSocialNombreComercialYDireccion(): void
    {
        $datos = $this->servicio([
            'ruc'             => '20123456789',
            'razonSocial'     => 'EMPRESA DEMOSTRACION S.A.C.',
            'nombreComercial' => 'EMPRESA DEMO',
            'direccion'       => 'AV. EJEMPLO 123',
            'distrito'        => 'JOSE LEONARDO ORTIZ',
            'provincia'       => 'CHICLAYO',
            'departamento'    => 'LAMBAYEQUE',
        ])->consultar('20123456789');

        $this->assertSame([
            'razon_social'     => 'EMPRESA DEMOSTRACION S.A.C.',
            'nombre_comercial' => 'EMPRESA DEMO',
            'direccion'        => 'AV. EJEMPLO 123, JOSE LEONARDO ORTIZ, CHICLAYO, LAMBAYEQUE',
        ], $datos);
    }

    public function testDireccionOmiteVaciosYGuiones(): void
    {
        $datos = $this->servicio([
            'razonSocial'     => 'EMPRESA DEMO',
            'nombreComercial' => '-',
            'direccion'       => '-',
            'distrito'        => 'CHICLAYO',
            'provincia'       => '',
            'departamento'    => 'LAMBAYEQUE',
        ])->consultar('20123456789');

        $this->assertSame('CHICLAYO, LAMBAYEQUE', $datos['direccion']);
        $this->assertNull($datos['nombre_comercial']);
    }

    public function testDireccionNulaCuandoNoHayPartes(): void
    {
        $datos = $this->servicio([
            'razonSocial' => 'EMPRESA DEMO',
        ])->consultar('20123456789');

        $this->assertNull($datos['direccion']);
        $this->assertNull($datos['nombre_comercial']);
    }

    public function testRechazaRespuestaSinRazonSocial(): void
    {
        $this->rechazo(fn () => $this->servicio(['ruc' => '20123456789'])->consultar('20123456789'));
    }

    public function testRechazaFormatosInvalidosSinConsultarAlCliente(): void
    {
        $cliente = $this->createMock(ApisperuClient::class);
        $cliente->expects($this->never())->method('consultarRuc');

        foreach (['2012345678', '201234567890', '2012345678A', ''] as $ruc) {
            $this->rechazo(fn () => (new RucService($cliente))->consultar($ruc), 422);
        }
    }
}
