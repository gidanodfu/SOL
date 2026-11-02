<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Config\CvRateLimit;
use App\Exceptions\ApiException;
use CodeIgniter\Database\BaseConnection;

/**
 * Rate limiting de carga de CV con ventanas fijas persistidas en MySQL.
 *
 * Cada carga consume una unidad en cuatro contadores independientes:
 * dos por usuario (ráfaga corta y ventana larga) y dos por IP, como
 * complemento para evitar abuso desde varias cuentas. Los umbrales y las
 * ventanas se leen de Config\CvRateLimit (variables cvRateLimit.*).
 *
 * El UPSERT y la lectura del contador ocurren en la misma transacción. Así el
 * límite se evalúa con el valor ya incrementado y las cargas concurrentes se
 * serializan por la fila (clave, ventana_inicio). Si se supera cualquier
 * límite, se revierte la transacción y se responde 429 con Retry-After; no se
 * modifica ningún CV.
 */
class CvRateLimiter
{
    private BaseConnection $db;

    private CvRateLimit $config;

    public function __construct(?BaseConnection $db = null, ?CvRateLimit $config = null)
    {
        $this->db     = $db ?? db_connect();
        $this->config = $config ?? config(CvRateLimit::class);
    }

    /**
     * Consume una unidad de cada política. Lanza ApiException 429 si alguna
     * ventana ya está agotada.
     */
    public function consumir(int $usuarioId, string $ip): void
    {
        $politicas = [
            ['cv:user:' . $usuarioId . ':short', $this->config->userShortLimit, $this->config->userShortWindow],
            ['cv:user:' . $usuarioId . ':long', $this->config->userLongLimit, $this->config->userLongWindow],
            ['cv:ip:' . hash('sha256', $ip) . ':short', $this->config->ipShortLimit, $this->config->ipShortWindow],
            ['cv:ip:' . hash('sha256', $ip) . ':long', $this->config->ipLongLimit, $this->config->ipLongWindow],
        ];

        if (! $this->db->transBegin()) {
            throw new \RuntimeException('No se pudo iniciar el control de rate limiting de CV.');
        }

        try {
            $espera = 0;

            foreach ($politicas as [$clave, $limite, $ventana]) {
                $restante = $this->consumirVentana($clave, $limite, $ventana);
                if ($restante !== null) {
                    $espera = max($espera, $restante);
                }
            }

            if ($espera > 0) {
                $this->db->transRollback();

                throw ApiException::demasiadasSolicitudes(
                    'Ha realizado demasiadas cargas de CV. Intente nuevamente en '
                    . $espera . ' segundos.',
                    $espera,
                );
            }

            if (! $this->db->transStatus()) {
                throw new \RuntimeException('No se pudo registrar el límite de carga de CV.');
            }

            $this->db->transCommit();
        } catch (\Throwable $e) {
            if ($this->db->transDepth > 0) {
                $this->db->transRollback();
            }

            throw $e;
        }
    }

    /**
     * Incrementa y evalúa una ventana. Devuelve los segundos restantes si se
     * superó el límite, o null si la carga está permitida.
     */
    private function consumirVentana(string $clave, int $limite, int $ventana): ?int
    {
        $inicio = $this->inicioVentana($ventana);

        $this->db->query(
            'INSERT INTO rate_limit_contadores (clave, ventana_inicio, usos, created_at, updated_at) '
            . 'VALUES (?, ?, 1, NOW(), NOW()) '
            . 'ON DUPLICATE KEY UPDATE usos = usos + 1, updated_at = NOW()',
            [$clave, $inicio],
        );

        $fila = $this->db->query(
            'SELECT usos, TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(ventana_inicio, INTERVAL ' . $ventana . ' SECOND)) AS restantes '
            . 'FROM rate_limit_contadores WHERE clave = ? AND ventana_inicio = ?',
            [$clave, $inicio],
        )->getRowArray();

        if ($fila === null) {
            throw new \RuntimeException('No se pudo leer el contador de carga de CV.');
        }

        if ((int) $fila['usos'] <= $limite) {
            return null;
        }

        return max(1, (int) $fila['restantes']);
    }

    /**
     * Inicio de la ventana fija vigente, calculado con el reloj de MySQL para
     * que el almacenamiento y la comparación usen la misma zona horaria.
     */
    private function inicioVentana(int $ventana): string
    {
        $fila = $this->db->query(
            'SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(NOW()) / ?) * ?) AS inicio',
            [$ventana, $ventana],
        )->getRowArray();

        return (string) ($fila['inicio'] ?? '');
    }
}
