<?php

// SPDX-License-Identifier: MIT

namespace App\Exceptions;

use RuntimeException;

/**
 * Excepción de la capa de negocio/API con código HTTP y errores de validación.
 * Se convierte en JSON por ApiExceptionHandler (RT-08).
 */
class ApiException extends RuntimeException
{
    /** @var list<string> */
    private array $errores;

    /** @var array<string, string> */
    private array $campos;

    private int $httpCode;

    private int $retryAfter = 0;

    /**
     * @param list<string> $errores
     * @param array<string, string> $campos
     */
    public function __construct(
        string $mensaje,
        int $httpCode = 400,
        array $errores = [],
        int $retryAfter = 0,
        array $campos = [],
    ) {
        parent::__construct($mensaje);
        $this->httpCode   = $httpCode;
        $this->errores    = $errores;
        $this->retryAfter = $retryAfter;
        $this->campos     = $campos;
    }

    public static function badRequest(string $mensaje): self
    {
        return new self($mensaje, 400);
    }

    public static function noAutorizado(string $mensaje = 'Debe iniciar sesión para acceder a este recurso.'): self
    {
        return new self($mensaje, 401);
    }

    public static function prohibido(string $mensaje = 'No tiene permisos para realizar esta operación.'): self
    {
        return new self($mensaje, 403);
    }

    public static function noEncontrado(string $mensaje = 'El recurso solicitado no existe.'): self
    {
        return new self($mensaje, 404);
    }

    /**
     * @param array<string, string> $campos
     */
    public static function conflicto(string $mensaje, array $campos = []): self
    {
        return new self($mensaje, 409, [], 0, $campos);
    }

    /**
     * @param list<string> $errores
     * @param array<string, string> $campos
     */
    public static function validacion(
        string $mensaje = 'Datos inválidos.',
        array $errores = [],
        array $campos = [],
    ): self {
        return new self($mensaje, 422, $errores, 0, $campos);
    }

    public static function demasiadasSolicitudes(string $mensaje = 'Demasiados intentos. Intente nuevamente más tarde.', int $retryAfter = 0): self
    {
        return new self($mensaje, 429, [], $retryAfter);
    }

    public function getHttpCode(): int
    {
        return $this->httpCode;
    }

    public function getRetryAfter(): int
    {
        return $this->retryAfter;
    }

    /**
     * @return list<string>
     */
    public function getErrores(): array
    {
        return $this->errores;
    }

    /**
     * @return array<string, string>
     */
    public function getCampos(): array
    {
        return $this->campos;
    }
}
