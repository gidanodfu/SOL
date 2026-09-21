<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Empresa;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Repositories\EmpresaRepository;
use App\Services\PostulacionService;

/**
 * Bandeja de postulaciones de la empresa (RF-33..RF-40). La empresa solo accede a
 * postulaciones de SUS ofertas (RT-05). El CV se entrega mediante URL firmada y
 * solo si la postulación es de la empresa (RT-CV-04/05).
 */
class PostulacionesController extends BaseApiController
{
    private const ESTADOS = ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'];

    private PostulacionService $servicio;

    private int $empresaId;

    public function __construct()
    {
        $empresa = (new EmpresaRepository())->porUserId(service('guard')->id());
        if ($empresa === null) {
            throw ApiException::noEncontrado('No se encontró la empresa asociada a su cuenta.');
        }

        $this->empresaId = (int) $empresa['id'];
        $this->servicio  = new PostulacionService();
    }

    public function index()
    {
        $estado = $this->request->getGet('estado') ?: null;
        if ($estado !== null && ! in_array($estado, self::ESTADOS, true)) {
            throw ApiException::validacion('Estado de postulación no válido.');
        }

        $ofertaId = $this->request->getGet('oferta_id') ?: null;
        if ($ofertaId !== null && ! ctype_digit((string) $ofertaId)) {
            throw ApiException::validacion('Oferta no válida.');
        }

        return $this->ok($this->servicio->listarDeEmpresa($this->empresaId, $estado, $ofertaId !== null ? (int) $ofertaId : null), 'Postulaciones recibidas.');
    }

    public function show($id)
    {
        return $this->ok($this->servicio->detalleDeEmpresa($this->empresaId, (int) $id), 'Detalle de la postulación.');
    }

    public function estado($id)
    {
        $cuerpo = $this->cuerpo();
        $this->servicio->cambiarEstadoDeEmpresa($this->empresaId, (int) $id, (string) ($cuerpo['estado'] ?? ''));

        return $this->sinContenido('Estado de la postulación actualizado.');
    }

    public function activacion($id)
    {
        $cuerpo = $this->cuerpo();
        $this->servicio->cambiarActivacionDeEmpresa($this->empresaId, (int) $id, (bool) ($cuerpo['activo'] ?? false));

        return $this->sinContenido('Estado de activación actualizado.');
    }

    public function cv($id)
    {
        return $this->ok(['url' => $this->servicio->urlCvAutorizada($this->empresaId, (int) $id)], 'URL de descarga del CV.');
    }

    /**
     * Stream del CV cuando el driver es local (RT-CV-04). Con Supabase, la descarga
     * usa la URL firmada de "cv".
     */
    public function cvArchivo($id, $claveCodificada)
    {
        $archivo = $this->servicio->archivoCvAutorizado($this->empresaId, (int) $id, (string) $claveCodificada);
        if ($archivo === null) {
            throw ApiException::noEncontrado('El archivo no existe.');
        }

        return $this->response
            ->setContentType($archivo['mime'], 'UTF-8')
            ->setHeader('Content-Disposition', 'attachment; filename="' . $archivo['nombre'] . '"')
            ->setBody(file_get_contents($archivo['ruta']));
    }
}
