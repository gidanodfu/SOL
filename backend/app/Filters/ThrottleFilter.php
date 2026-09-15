<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Rate limiting por IP usando el Throttler nativo de CI4 (token bucket).
 * Uso en rutas: filter 'throttle:capacidad,segundos' (p. ej. 'throttle:10,300').
 * La clave se compone de método+ruta+IP; no se confía en datos del cliente.
 */
class ThrottleFilter implements FilterInterface
{
    private const DEFECTO = [60, 60];

    public function before(RequestInterface $request, $arguments = null)
    {
        [$capacidad, $segundos] = $this->parametros($arguments);

        $ip  = $request->getIPAddress();
        $key = sha1($request->getMethod() . '|' . $request->getPath() . '|' . $ip);

        $throttler = service('throttler');
        if ($throttler->check($key, $capacidad, $segundos)) {
            return null;
        }

        $espera = max(1, $throttler->getTokenTime());

        return service('response')
            ->setStatusCode(429)
            ->setContentType('application/json', 'UTF-8')
            ->setHeader('Retry-After', (string) $espera)
            ->setBody(json_encode([
                'success' => false,
                'message' => 'Demasiadas solicitudes. Intente nuevamente en ' . $espera . ' segundos.',
                'errors'  => [],
            ], JSON_UNESCAPED_UNICODE));
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function parametros($arguments): array
    {
        $args = is_array($arguments) ? array_values($arguments) : [];

        $capacidad = isset($args[0]) && is_numeric($args[0]) ? (int) $args[0] : self::DEFECTO[0];
        $segundos  = isset($args[1]) && is_numeric($args[1]) ? (int) $args[1] : self::DEFECTO[1];

        return [max(1, $capacidad), max(1, $segundos)];
    }
}
