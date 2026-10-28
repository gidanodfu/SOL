<?php

// SPDX-License-Identifier: MIT

namespace App\Filters;

use App\Services\AutorizacionMunicipalService;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Autorización municipal centralizada. Se ejecuta después de `jwt` y
 * `rol:admin`; el perfil se recarga desde MySQL en cada petición.
 *
 * Uso: filter `permiso:municipal.lectura` o `permiso:usuarios`.
 */
class PermisoMunicipalFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $permiso = is_array($arguments) ? implode('', $arguments) : (string) $arguments;
        if ($permiso === '') {
            $permiso = 'municipal.lectura';
        }

        if (! (new AutorizacionMunicipalService())->permite($permiso)) {
            return service('response')
                ->setStatusCode(403)
                ->setContentType('application/json', 'UTF-8')
                ->setBody(json_encode([
                    'success' => false,
                    'message' => 'Su perfil municipal no permite realizar esta operación.',
                    'errors'  => [],
                ], JSON_UNESCAPED_UNICODE));
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
