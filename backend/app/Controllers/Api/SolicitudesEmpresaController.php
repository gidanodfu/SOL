<?php

namespace App\Controllers\Api;

use App\Services\RucService;
use App\Services\SolicitudEmpresaService;

/**
 * Solicitud pública de registro de empresa (RUC verificado) y activación de la
 * cuenta mediante enlace de un solo uso enviado tras la aprobación municipal.
 */
class SolicitudesEmpresaController extends BaseApiController
{
    /**
     * Verificación previa del RUC para autocompletar el formulario de solicitud.
     */
    public function verificarRuc()
    {
        $ruc = (string) ($this->cuerpo()['ruc'] ?? '');

        if (! preg_match('/^\d{11}$/', $ruc)) {
            return $this->response
                ->setStatusCode(422)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Ingrese un RUC válido (11 dígitos).',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        return $this->ok((new RucService())->consultar($ruc), 'RUC verificado.');
    }

    public function solicitar()
    {
        $id = (new SolicitudEmpresaService())->solicitar($this->cuerpo());

        return $this->creado(['id' => $id, 'estado' => 'pendiente'], 'Solicitud enviada. La Municipalidad revisará su solicitud y le notificará el resultado.');
    }

    public function verActivacion($token)
    {
        $datos = (new SolicitudEmpresaService())->verActivacion((string) $token);

        return $this->ok($datos, 'El enlace es válido. Defina su contraseña para activar la cuenta.');
    }

    public function activarCuenta($token)
    {
        (new SolicitudEmpresaService())->activar((string) $token, $this->cuerpo());

        return $this->sinContenido('Cuenta activada correctamente. Ya puede iniciar sesión con su correo y contraseña.');
    }
}
