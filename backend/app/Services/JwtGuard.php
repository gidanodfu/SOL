<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Entities\Usuario;

/**
 * Guard del usuario autenticado en la petición actual. El filtro JwtAuthFilter lo
 * rellena tras validar el token y recargar el usuario desde MySQL (fuente de verdad,
 * RF-03). Singleton por request (Config\Services).
 */
class JwtGuard
{
    private ?Usuario $usuario = null;

    public function iniciar(Usuario $usuario): void
    {
        $this->usuario = $usuario;
    }

    public function usuario(): ?Usuario
    {
        return $this->usuario;
    }

    public function id(): int
    {
        return $this->usuario?->id ?? 0;
    }

    public function rol(): string
    {
        return $this->usuario?->rol ?? '';
    }

    public function nombreCompleto(): string
    {
        return $this->usuario?->nombreCompleto() ?? '';
    }
}
