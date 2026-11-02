<?php

// SPDX-License-Identifier: MIT

namespace App\Config;

use CodeIgniter\Config\BaseConfig;

/**
 * Límites de carga de CV. Los valores se pueden sobrescribir con variables de
 * entorno para ajustar producción sin tocar código.
 *
 * El límite por usuario es la protección principal; el límite por IP cubre
 * intentos desde varias cuentas y clientes automatizados.
 */
class CvRateLimit extends BaseConfig
{
    public int $userShortLimit = 5;

    public int $userShortWindow = 600;

    public int $userLongLimit = 20;

    public int $userLongWindow = 3600;

    public int $ipShortLimit = 10;

    public int $ipShortWindow = 600;

    public int $ipLongLimit = 40;

    public int $ipLongWindow = 3600;

    public function __construct()
    {
        parent::__construct();

        $this->userShortLimit = $this->entero('cvRateLimit.userShortLimit', $this->userShortLimit);
        $this->userShortWindow = $this->entero('cvRateLimit.userShortWindow', $this->userShortWindow);
        $this->userLongLimit = $this->entero('cvRateLimit.userLongLimit', $this->userLongLimit);
        $this->userLongWindow = $this->entero('cvRateLimit.userLongWindow', $this->userLongWindow);
        $this->ipShortLimit = $this->entero('cvRateLimit.ipShortLimit', $this->ipShortLimit);
        $this->ipShortWindow = $this->entero('cvRateLimit.ipShortWindow', $this->ipShortWindow);
        $this->ipLongLimit = $this->entero('cvRateLimit.ipLongLimit', $this->ipLongLimit);
        $this->ipLongWindow = $this->entero('cvRateLimit.ipLongWindow', $this->ipLongWindow);
    }

    private function entero(string $clave, int $defecto): int
    {
        $valor = env($clave);

        return is_numeric($valor) && (int) $valor > 0 ? (int) $valor : $defecto;
    }
}
