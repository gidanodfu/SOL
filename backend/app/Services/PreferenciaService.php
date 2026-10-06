<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\UiPreferenceModel;

/**
 * Preferencias de interfaz por usuario (tema, modo, fuente y accesibilidad).
 * Cada método opera sobre el usuario indicado por la capa autenticada; nunca
 * sobre una configuración global. Guarda por upsert una única fila por usuario
 * y admite actualizaciones parciales.
 */
class PreferenciaService
{
    public const TEMAS = ['blue', 'olive', 'amber', 'obsidian', 'red'];

    public const MODOS = ['light', 'dark', 'system'];

    public const FUENTES = ['default'];

    public const POR_DEFECTO = [
        'theme'    => 'blue',
        'mode'     => 'dark',
        'font'     => 'default',
        'reduced'  => false,
        'contrast' => false,
    ];

    private UiPreferenceModel $prefs;

    public function __construct(?UiPreferenceModel $prefs = null)
    {
        $this->prefs = $prefs ?? model(UiPreferenceModel::class);
    }

    /**
     * @return array{theme:string,mode:string,font:string,reducedMotion:bool,highContrast:bool}
     */
    public function obtener(int $usuarioId): array
    {
        $fila = $this->prefs->find($usuarioId) ?? [];

        return [
            'theme'         => $this->valorValido($fila['theme'] ?? null, self::TEMAS, self::POR_DEFECTO['theme']),
            'mode'          => $this->valorValido($fila['mode'] ?? null, self::MODOS, self::POR_DEFECTO['mode']),
            'font'          => $this->valorValido($fila['font'] ?? null, self::FUENTES, self::POR_DEFECTO['font']),
            'reducedMotion' => (bool) ($fila['reduced_motion'] ?? 0),
            'highContrast'  => (bool) ($fila['high_contrast'] ?? 0),
        ];
    }

    /**
     * Actualiza solo las claves presentes en $datos (upsert por usuario).
     *
     * @param array<string, mixed> $datos
     *
     * @return array{theme:string,mode:string,font:string,reducedMotion:bool,highContrast:bool}
     */
    public function guardar(int $usuarioId, array $datos): array
    {
        $valores = [];

        if (array_key_exists('theme', $datos)) {
            $valores['theme'] = $this->exigirEnLista((string) $datos['theme'], self::TEMAS, 'Tema no válido.');
        }
        if (array_key_exists('mode', $datos)) {
            $valores['mode'] = $this->exigirEnLista((string) $datos['mode'], self::MODOS, 'Modo no válido.');
        }
        if (array_key_exists('font', $datos)) {
            $valores['font'] = $this->exigirEnLista((string) $datos['font'], self::FUENTES, 'Fuente no válida.');
        }
        if (array_key_exists('reducedMotion', $datos)) {
            $valores['reduced_motion'] = $this->booleano($datos['reducedMotion'], 'Valor no válido para reducir animaciones.');
        }
        if (array_key_exists('highContrast', $datos)) {
            $valores['high_contrast'] = $this->booleano($datos['highContrast'], 'Valor no válido para alto contraste.');
        }

        if ($valores === []) {
            throw ApiException::validacion('No se recibieron preferencias válidas.', ['No se recibieron preferencias válidas.']);
        }

        if ($this->prefs->find($usuarioId) !== null) {
            $this->prefs->update($usuarioId, $valores);
        } else {
            $this->prefs->insert(['user_id' => $usuarioId] + $valores);
        }

        return $this->obtener($usuarioId);
    }

    /**
     * @param list<string> $permitidos
     */
    private function exigirEnLista(string $valor, array $permitidos, string $mensaje): string
    {
        if (! in_array($valor, $permitidos, true)) {
            throw ApiException::validacion($mensaje, [$mensaje]);
        }

        return $valor;
    }

    /**
     * @param mixed $valor
     */
    private function booleano($valor, string $mensaje): int
    {
        if (is_bool($valor)) {
            return $valor ? 1 : 0;
        }
        if (is_int($valor) && ($valor === 0 || $valor === 1)) {
            return $valor;
        }
        if (is_string($valor)) {
            $normalizado = strtolower(trim($valor));
            if (in_array($normalizado, ['1', 'true'], true)) {
                return 1;
            }
            if (in_array($normalizado, ['0', 'false'], true)) {
                return 0;
            }
        }

        throw ApiException::validacion($mensaje, [$mensaje]);
    }

    /**
     * @param list<string> $permitidos
     */
    private function valorValido(?string $valor, array $permitidos, string $defecto): string
    {
        return $valor !== null && in_array($valor, $permitidos, true) ? $valor : $defecto;
    }
}
