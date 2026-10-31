<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
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
        $id = $servicio->crear($this->datosActividad(), $this->request->getFile('imagen'));

        return $this->creado(['id' => $id], 'Actividad registrada.');
    }

    public function update($id)
    {
        (new ActividadService())->actualizar((int) $id, $this->datosActividad());

        return $this->sinContenido('Actividad actualizada.');
    }

    public function estado($id)
    {
        $cuerpo = $this->cuerpo();
        (new ActividadService())->cambiarEstado((int) $id, (string) ($cuerpo['estado'] ?? ''));

        return $this->sinContenido('Estado de la actividad actualizado.');
    }

    public function subirImagen($id)
    {
        $archivo = $this->request->getFile('imagen');
        if ($archivo === null) {
            $mensaje = 'Debes subir una imagen para la actividad.';

            throw ApiException::validacion($mensaje, [$mensaje], ['imagen' => $mensaje]);
        }

        (new ActividadService())->subirImagen((int) $id, $archivo);

        return $this->sinContenido('Imagen de la actividad actualizada.');
    }

    public function eliminarImagen($id)
    {
        (new ActividadService())->eliminarImagen((int) $id);

        return $this->sinContenido('Imagen de la actividad eliminada.');
    }

    /**
     * Datos de la actividad aceptados por el contrato. El formulario envía
     * multipart (con la imagen) y los clientes de edición pueden enviar JSON.
     *
     * @return array<string, mixed>
     */
    private function datosActividad(): array
    {
        $tipoContenido = strtolower($this->request->getHeaderLine('Content-Type'));
        if (str_contains($tipoContenido, 'application/json')) {
            $datos = $this->cuerpo();
        } else {
            $datos = (array) $this->request->getPost();
        }

        return $this->solo($datos, [
            'tipo', 'nombre', 'descripcion', 'fecha_inicio', 'fecha_fin',
            'lugar', 'modalidad', 'organizador', 'enlace',
        ]);
    }
}
