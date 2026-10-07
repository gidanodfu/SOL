<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

/**
 * Representación legible de la antigüedad en la plataforma a partir de la fecha
 * real de alta (`empresas.created_at`). Fuente única: el frontend nunca la
 * recalcula, solo muestra el texto devuelto por la API.
 */
class AntiguedadService
{
    public static function texto(?string $fecha): ?string
    {
        if (empty($fecha)) {
            return null;
        }

        try {
            $alta = new \DateTimeImmutable($fecha);
        } catch (\Throwable) {
            return null;
        }

        $hoy = new \DateTimeImmutable('today');
        if ($alta > $hoy) {
            return null;
        }

        $diff   = $alta->diff($hoy);
        $anios  = (int) $diff->y;
        $meses  = (int) $diff->m;

        $partes = [];
        if ($anios > 0) {
            $partes[] = $anios . ' ' . ($anios === 1 ? 'año' : 'años');
        }
        if ($meses > 0) {
            $partes[] = $meses . ' ' . ($meses === 1 ? 'mes' : 'meses');
        }

        if ($partes === []) {
            return 'menos de un mes';
        }

        return count($partes) === 1 ? $partes[0] : $partes[0] . ' y ' . $partes[1];
    }
}
