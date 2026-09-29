<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Validation\Validador;
use Symfony\Component\HtmlSanitizer\HtmlSanitizer as SanitizadorSymfony;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

/**
 * Sanitización del HTML generado por el editor enriquecido (RTE). Es la
 * autoridad del backend: el contenido del navegador nunca se persiste crudo.
 *
 * Allow-list mínima acordada: p, br, strong, b, em, i, u, ul, ol, li y a.
 * Enlaces solo http/https, rel forzado a noopener noreferrer. Cualquier otro
 * elemento (script, iframe, svg, style, embed, object…) se elimina junto con
 * su contenido por la acción por defecto (solo se permiten los listados).
 */
class HtmlSanitizer
{
    private SanitizadorSymfony $sanitizador;

    public function __construct()
    {
        $config = (new HtmlSanitizerConfig())
            ->allowElement('p')
            ->allowElement('br')
            ->allowElement('strong')
            ->allowElement('b')
            ->allowElement('em')
            ->allowElement('i')
            ->allowElement('u')
            ->allowElement('ul')
            ->allowElement('ol')
            ->allowElement('li')
            ->allowElement('a', ['href', 'target', 'rel'])
            ->allowLinkSchemes(['http', 'https'])
            ->forceAttribute('a', 'rel', 'noopener noreferrer')
            // Explícitos por claridad: se eliminan con todo su contenido.
            ->dropElement('script')
            ->dropElement('style')
            ->dropElement('iframe')
            ->dropElement('embed')
            ->dropElement('object')
            ->dropElement('svg')
            ->withMaxInputLength(65535);

        $this->sanitizador = new SanitizadorSymfony($config);
    }

    /**
     * Devuelve el HTML saneado o null si el contenido no tiene texto visible
     * (p. ej. `<p><br></p>`), para no guardar HTML vacío.
     */
    public function limpiar(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $limpio = trim($this->sanitizador->sanitize($html));

        return Validador::textoVisible($limpio) === '' ? null : $limpio;
    }
}
