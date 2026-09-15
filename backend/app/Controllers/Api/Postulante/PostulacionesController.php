<?php

namespace App\Controllers\Api\Postulante;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Services\PostulacionService;

/**
 * Postulaciones del ciudadano (RF-30..RF-32). La identidad se resuelve desde la
 * sesión; el postulante solo opera sus propias postulaciones.
 */
class PostulacionesController extends BaseApiController
{
    private PostulacionService $servicio;

    private int $postulanteId;

    public function __construct()
    {
        $postulante = (new PostulanteModel())->porUserId(service('guard')->id());
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        $this->postulanteId = (int) $postulante->id;
        $this->servicio     = new PostulacionService();
    }

    public function index()
    {
        return $this->ok($this->servicio->listar($this->postulanteId), 'Mis postulaciones.');
    }

    public function store()
    {
        $cuerpo = $this->cuerpo();
        if (empty($cuerpo['oferta_id'])) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Debe indicar la oferta a la que postula.',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        $id = $this->servicio->postular($this->postulanteId, (int) $cuerpo['oferta_id']);

        return $this->creado(['id' => $id], 'Postulación registrada. La empresa la revisará próximamente.');
    }

    public function retirar($id)
    {
        $this->servicio->retirar($this->postulanteId, (int) $id);

        return $this->sinContenido('Postulación retirada.');
    }
}
