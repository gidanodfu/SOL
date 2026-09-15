<?php

namespace App\Filters;

use App\Models\UserModel;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Autenticación por JWT (RF-01/RF-02, RT-18). Verifica la firma y expiración del
 * token y recarga al usuario desde MySQL (fuente de verdad, RF-03), validando
 * además su estado activo (RF-06/RN-10) en cada petición.
 */
class JwtAuthFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $cabecera = $request->getHeaderLine('Authorization');

        if (! preg_match('/^Bearer\s+(\S+)$/i', $cabecera, $coincidencias)) {
            return $this->error('Debe iniciar sesión para acceder a este recurso.', 401);
        }

        $payload = service('jwtService')->verificar($coincidencias[1]);
        if ($payload === null || empty($payload['sub'])) {
            return $this->error('Su sesión expiró. Inicie sesión nuevamente.', 401);
        }

        // Recarga desde MySQL: existencia, rol y estado vigentes (RF-03/RF-04).
        $usuario = model(UserModel::class)->find((int) $payload['sub']);
        if ($usuario === null) {
            return $this->error('La cuenta ya no existe en el sistema.', 401);
        }
        if ($usuario->estado !== 'activo') {
            return $this->error('Su cuenta está inactiva. Contacte a la Municipalidad.', 403);
        }

        service('guard')->iniciar($usuario);

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }

    private function error(string $mensaje, int $codigo): ResponseInterface
    {
        return service('response')
            ->setStatusCode($codigo)
            ->setContentType('application/json', 'UTF-8')
            ->setBody(json_encode(['success' => false, 'message' => $mensaje, 'errors' => []]));
    }
}
