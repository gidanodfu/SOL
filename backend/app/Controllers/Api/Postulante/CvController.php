<?php

// SPDX-License-Identifier: MIT

namespace App\Controllers\Api\Postulante;

use App\Controllers\Api\BaseApiController;
use App\Exceptions\ApiException;
use App\Models\PostulanteModel;
use App\Services\CvService;

/**
 * Carga y consulta del CV (RF-21, RT-CV-01..RT-CV-08). El archivo se almacena en
 * Supabase Storage; MySQL solo guarda metadatos. La descarga exige autorización
 * (aquí: el propio postulante; las empresas accederán vía su postulación).
 */
class CvController extends BaseApiController
{
    private CvService $cv;

    private int $postulanteId;

    public function __construct()
    {
        $postulante = (new PostulanteModel())->porUserId(service('guard')->id());
        if ($postulante === null) {
            throw ApiException::noEncontrado('No se encontró el perfil de postulante.');
        }

        $this->postulanteId = (int) $postulante->id;
        $this->cv           = new CvService();
    }

    public function index()
    {
        return $this->ok([
            'vigente'   => $this->cv->activo($this->postulanteId),
            'historial' => array_map(static fn ($v) => [
                'id' => $v->id, 'version' => $v->version, 'nombre_original' => $v->nombre_original,
                'tamano' => $v->tamano, 'activo' => $v->activo,
                'fecha' => $v->updated_at?->format('Y-m-d H:i:s'),
            ], $this->cv->historial($this->postulanteId)),
            'limite_mensual' => $this->cv->consumoMensual($this->postulanteId),
        ], 'CV del postulante.');
    }

    public function upload()
    {
        $archivo = $this->request->getFile('cv');
        if ($archivo === null || ! $archivo->isValid()) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Debe enviar un archivo en el campo "cv".',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        $yaTenia = $this->cv->activo($this->postulanteId) !== null;
        $cv = $this->cv->subir($this->postulanteId, $archivo);

        return $this->ok([
            'id' => $cv->id, 'version' => $cv->version, 'nombre_original' => $cv->nombre_original,
            'tamano' => $cv->tamano,
            'limite_mensual' => $this->cv->consumoMensual($this->postulanteId),
        ], $yaTenia ? 'CV actualizado correctamente.' : 'CV cargado correctamente.', 201);
    }

    /**
     * Genera URL temporal/firmada del CV vigente para el dueño (RT-CV-05).
     */
    public function descargar()
    {
        return $this->ok(['url' => $this->cv->urlDescarga($this->postulanteId)], 'URL de descarga generada.');
    }

    /**
     * Stream del archivo cuando el driver es local. Autoriza solo al propietario
     * (RT-CV-04). Con Supabase Storage la descarga usa la URL firmada de "descargar".
     */
    public function archivo($claveCodificada)
    {
        $archivo = $this->cv->archivoLocalDelDuenno($this->postulanteId, (string) $claveCodificada);

        if ($archivo === null) {
            throw ApiException::noEncontrado('El archivo no existe.');
        }

        return $this->response
            ->setContentType($archivo['mime'], 'UTF-8')
            ->setHeader('Content-Disposition', 'attachment; filename="' . $archivo['nombre'] . '"')
            ->setBody(file_get_contents($archivo['ruta']));
    }
}
