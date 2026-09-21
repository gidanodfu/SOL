<?php

// SPDX-License-Identifier: MIT

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Autorización por rol (RF-05/RN-09, RT-19). Uso: filter 'rol:admin' o
 * 'rol:admin,empresa'. Se ejecuta tras JwtAuthFilter.
 */
class RoleFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $permitidos = is_array($arguments) && $arguments !== [] ? $arguments : [];

        // Nunca se confía en el rol del token: viene de la BD recargada (RF-04).
        $rolActual = service('guard')->rol();

        if (! in_array($rolActual, $permitidos, true)) {
            return service('response')
                ->setStatusCode(403)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'No tiene permisos para realizar esta operación.',
                    'errors'  => [],
                ]));
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
