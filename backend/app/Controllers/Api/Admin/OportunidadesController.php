<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\OportunidadService;

/**
 * Difusión de oportunidades externas: Empleos Perú y MYPE locales (RF-48..RF-51).
 */
class OportunidadesController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'fuente' => $this->request->getGet('fuente'),
            'activo' => $this->request->getGet('activo'),
        ], static fn ($v) => $v !== null && $v !== '');

        return $this->ok((new OportunidadService())->listar($filtros), 'Oportunidades de difusión.');
    }

    public function store()
    {
        $servicio = new OportunidadService();
        $id = $servicio->crear($this->cuerpo());

        return $this->creado(['id' => $id], 'Oportunidad publicada.');
    }

    public function update($id)
    {
        (new OportunidadService())->actualizar((int) $id, $this->cuerpo());

        return $this->sinContenido('Oportunidad actualizada.');
    }

    public function activacion($id)
    {
        $cuerpo = $this->cuerpo();
        (new OportunidadService())->cambiarActivacion((int) $id, (bool) ($cuerpo['activo'] ?? false));

        return $this->sinContenido('Estado de la oportunidad actualizado.');
    }
}
