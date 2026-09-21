<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\SolicitudEmpresaService;

/**
 * Bandeja municipal de solicitudes de registro de empresa: aprobar o rechazar y
 * obtener/regenerar el enlace de activación para entregarlo a la empresa.
 */
class SolicitudesEmpresaController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'estado' => $this->request->getGet('estado'),
            'q'      => $this->request->getGet('q'),
        ], static fn ($v) => $v !== null && $v !== '');

        // Tope de paginación: evita listados desmedidos desde el cliente.
        $limite = min(200, max(1, (int) ($this->request->getGet('limite') ?: 100)));
        $offset = max(0, (int) ($this->request->getGet('offset') ?: 0));

        return $this->ok((new SolicitudEmpresaService())->listar($filtros, $limite, $offset), 'Lista de solicitudes.');
    }

    public function show($id)
    {
        return $this->ok((new SolicitudEmpresaService())->obtener((int) $id), 'Detalle de la solicitud.');
    }

    public function aprobar($id)
    {
        $resultado = (new SolicitudEmpresaService())->aprobar(service('guard')->id(), (int) $id);

        return $this->ok($resultado, 'Solicitud aprobada. Se notificó a la empresa por correo.');
    }

    public function rechazar($id)
    {
        (new SolicitudEmpresaService())->rechazar(service('guard')->id(), (int) $id, $this->cuerpo());

        return $this->sinContenido('Solicitud rechazada. Se notificó a la empresa.');
    }

    public function enlace($id)
    {
        $link = (new SolicitudEmpresaService())->obtenerEnlace((int) $id);

        return $this->ok(['link' => $link], 'Enlace de activación generado. El enlace anterior quedó invalidado.');
    }
}
