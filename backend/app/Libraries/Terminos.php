<?php

// SPDX-License-Identifier: MIT

namespace App\Libraries;

/**
 * Identificador y versión vigente de los Términos y Condiciones de SOL.
 *
 * La aceptación persistida siempre usa esta versión, nunca un valor enviado
 * libremente por el cliente. Si se publica una nueva versión del documento,
 * debe incrementarse aquí y en el contenido legal del frontend.
 */
final class Terminos
{
    public const DOCUMENTO = 'terminos-condiciones';
    public const VERSION   = '1.0';
    public const ACTUALIZADO_EN = '2026-10-23';
}
