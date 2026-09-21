<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api;

use App\Services\AuthService;
use App\Services\JwtGuard;

/**
 * Operaciones de la cuenta propia de cualquier rol autenticado.
 */
class CuentaController extends BaseApiController
{
    public function cambiarContrasena()
    {
        $auth = new AuthService();
        $auth->cambiarContrasena(service('guard')->id(), $this->cuerpo());

        return $this->sinContenido('Contraseña actualizada correctamente.');
    }
}
