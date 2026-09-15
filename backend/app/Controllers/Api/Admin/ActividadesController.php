<?php

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\ActividadService;

/**
 * Gestión municipal de ferias, eventos, talleres y capacitaciones (RF-44..RF-47).
 */
class ActividadesController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'tipo'   => $this->request->getGet('tipo'),
            'estado' => $this->request->getGet('estado'),
        ], static fn ($v) => $v !== null && $v !== '');

        return $this->ok((new ActividadService())->listar($filtros), 'Actividades y eventos.');
    }

    public function store()
    {
        $servicio = new ActividadService();
        $id = $servicio->crear($this->cuerpo());

        return $this->creado(['id' => $id], 'Actividad registrada.');
    }

    public function update($id)
    {
        (new ActividadService())->actualizar((int) $id, $this->cuerpo());

        return $this->sinContenido('Actividad actualizada.');
    }

    public function estado($id)
    {
        $cuerpo = $this->cuerpo();
        (new ActividadService())->cambiarEstado((int) $id, (string) ($cuerpo['estado'] ?? ''));

        return $this->sinContenido('Estado de la actividad actualizado.');
    }
}
