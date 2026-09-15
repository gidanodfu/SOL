<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;

/**
 * Base de los controladores de la API REST. Toda respuesta usa la estructura
 * uniforme {success, message, data, errors} (RT-08). Los errores de negocio se
 * lanzan como ApiException desde Services y se serializan por ApiExceptionHandler.
 */
abstract class BaseApiController extends BaseController
{
    /**
     * @param mixed $data
     */
    protected function ok($data = null, string $mensaje = 'Operación exitosa.', int $codigo = 200)
    {
        return $this->response
            ->setStatusCode($codigo)
            ->setContentType('application/json', 'UTF-8')
            ->setBody(json_encode([
                'success' => true,
                'message' => $mensaje,
                'data'    => $data,
            ], JSON_UNESCAPED_UNICODE));
    }

    protected function creado($data = null, string $mensaje = 'Registro creado correctamente.')
    {
        return $this->ok($data, $mensaje, 201);
    }

    protected function sinContenido(string $mensaje = 'Operación exitosa.')
    {
        return $this->ok(null, $mensaje, 200);
    }

    /**
     * Cuerpo JSON de la petición como arreglo asociativo.
     *
     * @return array<string, mixed>
     */
    protected function cuerpo(): array
    {
        $json = $this->request->getJSON(true);

        return is_array($json) ? $json : [];
    }

    /**
     * @param list<string> $permitidos
     *
     * @return array<string, mixed> solo los campos permitidos
     */
    protected function solo(array $datos, array $permitidos): array
    {
        return array_intersect_key($datos, array_flip($permitidos));
    }
}
