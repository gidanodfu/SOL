<?php

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Repositories\EmpresaRepository;
use App\Services\ContratacionService;

/**
 * Contrataciones de la empresa como resultado del proceso de selección (RF-58).
 * Solo sobre sus propias postulaciones "seleccionado" (RN-18).
 */
class ContratacionesController extends BaseApiController
{
    private ContratacionService $servicio;

    private int $empresaId;

    public function __construct()
    {
        $empresa = (new EmpresaRepository())->porUserId(service('guard')->id());
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $this->empresaId = (int) $empresa['id'];
        $this->servicio  = new ContratacionService();
    }

    public function index()
    {
        return $this->ok($this->servicio->listarDeEmpresa($this->empresaId), 'Contrataciones registradas.');
    }

    public function opciones()
    {
        return $this->ok($this->servicio->opcionesDeEmpresa($this->empresaId), 'Postulaciones seleccionadas sin contratación.');
    }

    public function store()
    {
        $id = $this->servicio->registrar($this->empresaId, $this->cuerpo());

        return $this->creado(['id' => $id], 'Contratación registrada. El resultado alimenta los reportes municipales.');
    }

    public function update($id)
    {
        $this->servicio->actualizar($this->empresaId, (int) $id, $this->cuerpo());

        return $this->sinContenido('Contratación actualizada.');
    }
}
