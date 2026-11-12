<?php

// SPDX-License-Identifier: MIT

namespace Tests\Unit;

use App\Models\OfertaHabilidadModel;
use App\Repositories\OfertaRepository;
use App\Services\OfertaService;
use PHPUnit\Framework\TestCase;

/**
 * Regresión del N+1 de habilidades en la bandeja de la empresa: el servicio
 * debe pedir todas las habilidades en una sola llamada por lote.
 */
final class OfertaHabilidadesLoteTest extends TestCase
{
    public function testListarMiasSolicitaLasHabilidadesEnUnSoloLote(): void
    {
        $filas = [
            ['id' => 5, 'puesto' => 'Analista', 'estado' => 'publicada', 'fecha_cierre' => null],
            ['id' => 9, 'puesto' => 'Vendedor', 'estado' => 'borrador', 'fecha_cierre' => null],
            ['id' => 12, 'puesto' => 'Practicante', 'estado' => 'publicada', 'fecha_cierre' => null],
        ];

        $habilidades = new HabilidadesFake([
            5  => ['Excel', 'SQL'],
            9  => ['Atención al cliente'],
        ]);
        $repositorio = new RepositorioOfertasFake($filas);

        $servicio = new OfertaService(null, $habilidades, $repositorio);
        $resultado = $servicio->listarMias(1);

        $this->assertSame(1, $habilidades->llamadas, 'deVariasOfertas debe ejecutarse una sola vez');
        $this->assertSame([5, 9, 12], $habilidades->ultimosIds);
        $this->assertSame(['Excel', 'SQL'], $resultado[0]['habilidades']);
        $this->assertSame(['Atención al cliente'], $resultado[1]['habilidades']);
        $this->assertSame([], $resultado[2]['habilidades'], 'La oferta sin habilidades devuelve lista vacía');
        $this->assertSame('publicada', $resultado[0]['estado_efectivo']);
    }
}

final class RepositorioOfertasFake extends OfertaRepository
{
    /** @param list<array<string, mixed>> $filas */
    public function __construct(private array $filas)
    {
    }

    public function porEmpresa(int $empresaId, ?string $desde = null, ?string $hasta = null): array
    {
        return $this->filas;
    }
}

final class HabilidadesFake extends OfertaHabilidadModel
{
    public int $llamadas = 0;

    /** @var list<int> */
    public array $ultimosIds = [];

    /** @param array<int, list<string>> $mapa */
    public function __construct(private array $mapa)
    {
    }

    public function deOferta(int $ofertaId): array
    {
        throw new \RuntimeException('listarMias no debe consultar oferta por oferta');
    }

    public function deVariasOfertas(array $ofertaIds): array
    {
        $this->llamadas++;
        $this->ultimosIds = $ofertaIds;

        $resultado = [];
        foreach ($ofertaIds as $id) {
            if (isset($this->mapa[$id])) {
                $resultado[$id] = $this->mapa[$id];
            }
        }

        return $resultado;
    }
}
