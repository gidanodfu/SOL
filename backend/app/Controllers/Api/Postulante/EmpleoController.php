<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Postulante;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Services\OfertaService;

/**
 * Búsqueda de oportunidades laborales del postulante (RF-27..RF-29). Solo se
 * exponen ofertas publicadas y vigentes.
 */
class EmpleoController extends BaseApiController
{
    private ?int $postulanteId;

    public function __construct()
    {
        $this->postulanteId = (new PostulanteModel())->porUserId(service('guard')->id())?->id ?? null;
    }

    public function index()
    {
        $filtros = array_filter([
            'categoria_id' => $this->request->getGet('categoria_id'),
            'ubicacion'    => $this->request->getGet('ubicacion'),
            'formacion'    => $this->request->getGet('formacion'),
            'experiencia'  => $this->request->getGet('experiencia'),
        ], static fn ($v) => $v !== null && $v !== '');

        return $this->ok((new OfertaService())->listarPublicadas($filtros), 'Ofertas disponibles.');
    }

    public function show($id)
    {
        return $this->ok(
            (new OfertaService())->detallePublica((int) $id, $this->postulanteId),
            'Detalle de la oferta.',
        );
    }
}
