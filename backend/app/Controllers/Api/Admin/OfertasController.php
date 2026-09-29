<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\OfertaService;

/**
 * Revisión y supervisión municipal de ofertas (RF-24/25/26): la Municipalidad
 * aprueba o rechaza las ofertas pendientes y puede cerrar las publicadas. Solo
 * el rol admin llega a estas rutas (filtro rol:admin); el aprobador se toma de
 * la sesión, nunca del cuerpo de la petición.
 */
class OfertasController extends BaseApiController
{
    public function index()
    {
        $estado = $this->request->getGet('estado') ?: null;

        return $this->ok((new OfertaService())->listarAdmin($estado), 'Bandeja de ofertas.');
    }

    public function show($id)
    {
        return $this->ok((new OfertaService())->detalleAdmin((int) $id), 'Detalle de la oferta.');
    }

    public function aprobar($id)
    {
        (new OfertaService())->aprobar(service('guard')->id(), (int) $id);

        return $this->sinContenido('Oferta aprobada y publicada.');
    }

    public function rechazar($id)
    {
        (new OfertaService())->rechazar(service('guard')->id(), (int) $id, $this->cuerpo());

        return $this->sinContenido('Oferta rechazada.');
    }

    public function cerrar($id)
    {
        (new OfertaService())->cerrarComoAdmin(service('guard')->id(), (int) $id);

        return $this->sinContenido('Oferta cerrada por supervisión municipal.');
    }
}
