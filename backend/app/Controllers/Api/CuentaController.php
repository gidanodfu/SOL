<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api;

use App\Services\AuthService;
use App\Services\PreferenciaService;

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

    public function preferencias()
    {
        return $this->ok(
            (new PreferenciaService())->obtener(service('guard')->id()),
            'Preferencias de interfaz.',
        );
    }

    public function guardarPreferencias()
    {
        return $this->ok(
            (new PreferenciaService())->guardar(service('guard')->id(), $this->cuerpo()),
            'Preferencias guardadas.',
        );
    }
}
