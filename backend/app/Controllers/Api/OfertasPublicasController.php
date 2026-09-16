<?php

namespace App\Controllers\Api;

use App\Models\PostulanteModel;
use App\Models\UserModel;
use App\Services\OfertaService;

/**
 * Bolsa de empleo pública: ofertas publicadas y vigentes visibles sin iniciar
 * sesión (buscar ofertas / ver detalle). Si la petición trae un token válido,
 * el detalle informa además si el postulante ya se postuló a esa oferta.
 */
class OfertasPublicasController extends BaseApiController
{
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
            (new OfertaService())->detallePublica((int) $id, $this->postulanteSiHaySesion()),
            'Detalle de la oferta.',
        );
    }

    /**
     * Id del postulante autenticado (opcional): si la petición trae un token
     * válido de un usuario activo se devuelve su postulante; si no, null.
     */
    private function postulanteSiHaySesion(): ?int
    {
        $cabecera = $this->request->getHeaderLine('Authorization');
        if (! preg_match('/^Bearer\s+(\S+)$/i', $cabecera, $coincidencias)) {
            return null;
        }

        $payload = service('jwtService')->verificar($coincidencias[1]);
        if ($payload === null || empty($payload['sub'])) {
            return null;
        }

        $usuario = model(UserModel::class)->find((int) $payload['sub']);
        if ($usuario === null || $usuario->estado !== 'activo' || $usuario->rol !== 'postulante') {
            return null;
        }

        return (new PostulanteModel())->porUserId((int) $usuario->id)?->id ?? null;
    }
}
