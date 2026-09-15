<?php

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Repositories\EmpresaRepository;
use App\Services\OfertaService;

/**
 * Ofertas de la empresa autenticada (RF-22/23/26). La empresa solo opera sus
 * propias ofertas; la identidad se resuelve desde la sesión (RT-05).
 */
class OfertasController extends BaseApiController
{
    private int $empresaId;

    public function __construct()
    {
        $empresa = (new EmpresaRepository())->porUserId(service('guard')->id());
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $this->empresaId = (int) $empresa['id'];
    }

    public function index()
    {
        return $this->ok((new OfertaService())->listarMias($this->empresaId), 'Mis ofertas laborales.');
    }

    public function show($id)
    {
        return $this->ok((new OfertaService())->detallePropia($this->empresaId, (int) $id), 'Detalle de la oferta.');
    }

    public function store()
    {
        $id = (new OfertaService())->crear($this->empresaId, $this->cuerpo());

        return $this->creado(['id' => $id], 'Oferta guardada en borrador.');
    }

    public function publicar($id)
    {
        (new OfertaService())->publicar($this->empresaId, (int) $id);

        return $this->sinContenido('Oferta publicada. Ya está disponible para los postulantes.');
    }

    public function update($id)
    {
        (new OfertaService())->actualizar($this->empresaId, (int) $id, $this->cuerpo());

        return $this->sinContenido('Oferta actualizada.');
    }

    public function cerrar($id)
    {
        (new OfertaService())->cerrar($this->empresaId, (int) $id);

        return $this->sinContenido('Oferta cerrada.');
    }
}
