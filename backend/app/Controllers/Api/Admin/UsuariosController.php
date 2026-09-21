<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\UsuarioService;

/**
 * Administración de usuarios (RF-07). Solo rol municipal.
 */
class UsuariosController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'rol'    => $this->request->getGet('rol'),
            'estado' => $this->request->getGet('estado'),
            'q'      => $this->request->getGet('q'),
        ], static fn ($v) => $v !== null && $v !== '');

        // Tope de paginación: evita listados desmedidos desde el cliente.
        $limite  = min(200, max(1, (int) ($this->request->getGet('limite') ?: 100)));
        $offset  = max(0, (int) ($this->request->getGet('offset') ?: 0));

        return $this->ok((new UsuarioService())->listar($filtros, $limite, $offset), 'Lista de usuarios.');
    }

    public function show($id)
    {
        return $this->ok((new UsuarioService())->obtener((int) $id), 'Detalle del usuario.');
    }

    public function store()
    {
        $servicio = new UsuarioService();
        $id = $servicio->crear(service('guard')->id(), $this->cuerpo());

        return $this->creado(['id' => $id], 'Usuario creado correctamente.');
    }

    public function update($id)
    {
        (new UsuarioService())->actualizar(service('guard')->id(), (int) $id, $this->cuerpo());

        return $this->sinContenido('Usuario actualizado correctamente.');
    }

    public function estado($id)
    {
        $cuerpo = $this->cuerpo();
        (new UsuarioService())->cambiarEstado(service('guard')->id(), (int) $id, (string) ($cuerpo['estado'] ?? ''));

        return $this->sinContenido('Estado del usuario actualizado.');
    }

    public function resetPassword($id)
    {
        $cuerpo = $this->cuerpo();
        (new UsuarioService())->resetearContrasena(service('guard')->id(), (int) $id, (string) ($cuerpo['password'] ?? ''));

        return $this->sinContenido('Contraseña restablecida. Entregue la nueva credencial al usuario.');
    }
}
