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

    /**
     * Extrae URLs http(s) válidas de un contenido enriquecido: primero los
     * `href` de los <a>, luego las URLs escritas como texto plano. Valida el
     * esquema, normaliza (sin puntuación final) y elimina duplicados. Única
     * utilidad de extracción del sistema (la usan los servicios de negocio).
     *
     * @return list<string>
     */
    public function extraerUrls(?string $html): array
    {
        if ($html === null || trim($html) === '') {
            return [];
        }

        $encontradas = [];

        // Una sola pasada (izquierda→derecha) que alterna href de <a> y URL de
        // texto: así se respeta el ORDEN del documento y se toma la primera.
        $patron = '#<a\b[^>]*href\s*=\s*["\']([^"\']+)["\']|(https?://[^\s<>"\')\]]+)#i';
        if (preg_match_all($patron, $html, $coincidencias, PREG_SET_ORDER)) {
            foreach ($coincidencias as $m) {
                $url = ($m[1] ?? '') !== '' ? $m[1] : ($m[2] ?? '');
                $this->agregarUrl($encontradas, html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            }
        }

        return array_values($encontradas);
    }

    /**
     * Elimina del contenido la PRIMERA aparición de una URL concreta (la que se
     * promueve al campo de enlace). No borra otras URLs ni el resto del texto.
     * Idempotente: si la URL ya no está, el resultado no cambia.
     *
     * - Si aparece como `<a href="URL">…</a>`, se conserva el texto interno
     *   (sin el enlace) y, si ese texto era la propia URL, se elimina.
     * - Si aparece como texto plano, se elimina solo esa ocurrencia.
     */
    public function removerUrl(?string $html, string $url): ?string
    {
        if ($html === null || $url === '') {
            return $html;
        }

        $q = preg_quote($url, '#');

        // 1) Primera ancla con ese href: se conserva su texto interno (sin enlace).
        $html = preg_replace_callback(
            '#<a\b[^>]*href\s*=\s*["\']' . $q . '["\'][^>]*>(.*?)</a>#is',
            static fn ($m) => trim(strip_tags((string) $m[1])),
            $html,
            1,
        );

        // 2) Primera ocurrencia en texto plano (incluye el texto del ancla anterior).
        $html = preg_replace('#' . $q . '#', '', (string) $html, 1);

        // 3) Limpieza de espacios y saltos/parrafos vacíos sobrantes.
        $html = preg_replace('/[ \t]{2,}/', ' ', (string) $html);
        $html = preg_replace('#\s+</p>#i', '</p>', (string) $html);
        $html = preg_replace('#<p>\s+#i', '<p>', (string) $html);
        $html = preg_replace('#(?:<br\s*/?>\s*){3,}#i', '<br><br>', (string) $html);
        $html = preg_replace('#<p>\s*(<br\s*/?>)?\s*</p>#i', '', (string) $html);

        $html = trim((string) $html);

        return $html === '' ? null : $html;
    }

    /**
     * @param array<string, string> $encontradas clave = URL (dedupe)
     */
    private function agregarUrl(array &$encontradas, string $url): void
    {
        $url = rtrim(trim($url), ".,;:!?)\"'");
        if ($url === '' || mb_strlen($url) > 255) {
            return;
        }

        $esquema = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if (! in_array($esquema, ['http', 'https'], true) || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return;
        }

        $encontradas[$url] = $url;
    }
}
