<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\ActividadModel;
use App\Validation\Validador;

/**
 * Ferias, eventos, talleres y capacitaciones (RF-44..RF-47). Una sola entidad
 * "actividades" diferenciada por tipo. Estados: programado → en_curso →
 * finalizado; cancelado es reabrible.
 */
class ActividadService
{
    public const TIPOS = ['feria_empleo', 'evento', 'taller', 'capacitacion'];

    public const MODALIDADES = ['presencial', 'virtual', 'mixta'];

    private const TRANSICIONES = [
        'programado' => ['en_curso', 'finalizado', 'cancelado'],
        'en_curso'   => ['finalizado', 'cancelado'],
        'cancelado'  => ['programado'],
        'finalizado' => [],
    ];

    private ActividadModel $actividades;

    public function __construct(?ActividadModel $actividades = null)
    {
        $this->actividades = $actividades ?? model(ActividadModel::class);
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros = [], bool $soloPublicas = false): array
    {
        $builder = $this->actividades->db->table('actividades');

        if ($soloPublicas) {
            $builder->whereIn('estado', ['programado', 'en_curso']);
        } elseif (! empty($filtros['tipo'])) {
            $builder->where('tipo', $filtros['tipo']);
        }
        if (! empty($filtros['estado'])) {
            $builder->where('estado', $filtros['estado']);
        }

        return $builder->orderBy('fecha_inicio', 'DESC')->limit(200)->get()->getResultArray();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos): int
    {
        $datos = $this->validar($datos);
        $this->actividades->insert($datos);

        return (int) $this->actividades->getInsertID();
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $this->exigir($id);
        $this->actividades->update($id, $this->validar($datos));
    }

    public function cambiarEstado(int $id, string $estado): void
    {
        $actividad = $this->exigir($id);
        $permitidos = self::TRANSICIONES[$actividad['estado']] ?? [];
        if (! in_array($estado, $permitidos, true)) {
            throw ApiException::conflicto("No puede pasar de \"{$actividad['estado']}\" a \"{$estado}\".");
        }

        $this->actividades->update($id, ['estado' => $estado]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validar(array $datos): array
    {
        Validador::validar($datos, [
            'tipo'         => ['required', 'enum:' . implode(',', self::TIPOS)],
            'nombre'       => ['required', 'max:200'],
            'descripcion'  => ['max:10000'],
            'lugar'        => ['max:150'],
            'organizador'  => ['max:150'],
            'modalidad'    => ['enum:' . implode(',', self::MODALIDADES)],
            'fecha_inicio' => ['required', 'regex:/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/'],
            'fecha_fin'    => ['regex:/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/'],
        ]);

        $inicio = $datos['fecha_inicio'];
        $fin    = $datos['fecha_fin'] ?? null;
        if ($fin && strtotime($fin) < strtotime($inicio)) {
            throw ApiException::validacion('La fecha de fin no puede ser anterior al inicio.', ['La fecha de fin no puede ser anterior al inicio.']);
        }

        return [
            'tipo'        => $datos['tipo'],
            'nombre'      => $datos['nombre'],
            'descripcion' => $datos['descripcion'] ?? null,
            'fecha_inicio' => $this->normalizar($inicio),
            'fecha_fin'   => $fin ? $this->normalizar($fin) : null,
            'lugar'       => $datos['lugar'] ?? null,
            'modalidad'   => $datos['modalidad'] ?? null,
            'organizador' => $datos['organizador'] ?? null,
        ];
    }

    private function normalizar(string $fecha): string
    {
        return strlen($fecha) === 10 ? $fecha . ' 08:00:00' : $fecha;
    }

    /**
     * @return array<string, mixed>
     */
    private function exigir(int $id): array
    {
        $fila = $this->actividades->find($id);
        if ($fila === null) {
            throw ApiException::noEncontrado('La actividad no existe.');
        }

        return $fila;
    }
}
