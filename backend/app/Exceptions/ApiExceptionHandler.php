<?php

namespace App\Exceptions;

use CodeIgniter\Debug\ExceptionHandlerInterface;
use CodeIgniter\HTTP\CLIRequest;
use CodeIgniter\HTTP\IncomingRequest;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Convierte ApiException en la respuesta JSON uniforme de la API (RT-08).
 * No puede extender CodeIgniter\Debug\ExceptionHandler (clase final), por eso
 * implementa directamente ExceptionHandlerInterface.
 */
class ApiExceptionHandler implements ExceptionHandlerInterface
{
    /**
     * @param CLIRequest|IncomingRequest $request
     */
    public function handle(
        Throwable $exception,
        RequestInterface $request,
        ResponseInterface $response,
        int $statusCode,
        int $exitCode,
    ): void {
        if ($exception instanceof ApiException) {
            $api = $exception;
        } else {
            // Nunca exponer el mensaje interno (SQL, rutas, excepciones): se
            // registra en el log y el cliente recibe un mensaje genérico.
            log_message('error', '[API] {clase}: {mensaje} en {archivo}:{linea}', [
                'clase'   => $exception::class,
                'mensaje' => $exception->getMessage(),
                'archivo' => $exception->getFile(),
                'linea'   => $exception->getLine(),
            ]);

            $codigo = $statusCode >= 400 && $statusCode < 600 ? $statusCode : 500;
            $api    = new ApiException($this->mensajeSeguro($codigo), $codigo);
        }

        $response->setStatusCode($api->getHttpCode());
        $response->setContentType('application/json', 'UTF-8');
        if ($api->getRetryAfter() > 0) {
            $response->setHeader('Retry-After', (string) $api->getRetryAfter());
        }
        $response->setBody(json_encode([
            'success' => false,
            'message' => $api->getMessage(),
            'errors'  => $api->getErrores(),
        ], JSON_UNESCAPED_UNICODE));
        $response->send();

        if (ENVIRONMENT !== 'testing') {
            // @codeCoverageIgnoreStart
            exit($exitCode);
            // @codeCoverageIgnoreEnd
        }
    }

    /**
     * Mensaje seguro para errores HTTP que no son de negocio.
     */
    private function mensajeSeguro(int $codigo): string
    {
        return match ($codigo) {
            400 => 'La solicitud no es válida.',
            401 => 'Debe iniciar sesión para acceder a este recurso.',
            403 => 'No tiene permisos para realizar esta operación.',
            404 => 'El recurso solicitado no existe.',
            405 => 'El método HTTP no está permitido para este recurso.',
            429 => 'Demasiadas solicitudes. Intente nuevamente más tarde.',
            default => 'Ocurrió un error inesperado. Intente nuevamente.',
        };
    }
}
