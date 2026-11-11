<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\ApisperuClient;
use App\Services\DniService;
use PHPUnit\Framework\TestCase;

final class DniServiceTest extends TestCase
{
    private function servicio(array $respuesta): DniService
    {
        $cliente = $this->createMock(ApisperuClient::class);
        $cliente->method('consultarDni')->willReturn($respuesta);

        return new DniService($cliente);
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

    public function testMapeaLaRespuestaAlContratoInterno(): void
    {
        $datos = $this->servicio([
            'dni'             => '12345678',
            'nombres'         => 'JUAN CARLOS',
            'apellidoPaterno' => 'PEREZ',
            'apellidoMaterno' => 'GARCIA',
            'codVerifica'     => '1',
        ])->consultar('12345678');

        $this->assertSame([
            'dni'       => '12345678',
            'nombres'   => 'JUAN CARLOS',
            'apellidos' => 'PEREZ GARCIA',
        ], $datos);
    }

    public function testApellidosToleraUnoDeLosDosCampos(): void
    {
        $datos = $this->servicio([
            'nombres'         => 'ANA',
            'apellidoPaterno' => 'TORRES',
            'apellidoMaterno' => '',
        ])->consultar('12345678');

        $this->assertSame('TORRES', $datos['apellidos']);
    }

    public function testRechazaRespuestaSinNombres(): void
    {
        $this->rechazo(fn () => $this->servicio(['dni' => '12345678'])->consultar('12345678'));
    }

    public function testRechazaFormatosInvalidosSinConsultarAlCliente(): void
    {
        $cliente = $this->createMock(ApisperuClient::class);
        $cliente->expects($this->never())->method('consultarDni');

        foreach (['1234567', '123456789', '1234567A', ''] as $dni) {
            $this->rechazo(fn () => (new DniService($cliente))->consultar($dni), 422);
        }
    }
}
