<?php

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\OfertaService;

/**
 * Supervisión municipal de ofertas (RF-24/25/26 adaptado): la empresa publica
 * directamente; el admin consulta el listado y puede cerrar ofertas publicadas.
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

    public function cerrar($id)
    {
        (new OfertaService())->cerrarComoAdmin(service('guard')->id(), (int) $id);

        return $this->sinContenido('Oferta cerrada por supervisión municipal.');
    }
}
