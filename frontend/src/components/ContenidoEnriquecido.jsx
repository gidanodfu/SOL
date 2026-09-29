// SPDX-License-Identifier: MIT
import DOMPurify from 'dompurify';

/**
 * Render seguro de contenido enriquecido (RTE) o de texto plano heredado.
 *
 * - El backend sanitiza al persistir (autoridad); aquí se aplica DOMPurify como
 *   defensa en profundidad antes de pintar.
 * - Si el contenido no tiene HTML permitido (datos antiguos), se muestra como
 *   texto plano conservando los saltos de línea.
 */
const TAGS_PERMITIDOS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a'];
const ATRIBUTOS_PERMITIDOS = ['href', 'target', 'rel'];
const TIENE_HTML = /<(p|br|strong|b|em|i|u|ul|ol|li|a)(\s|>|\/)/i;

function limpiar(html) {
  const saneado = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAGS_PERMITIDOS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    ALLOWED_URI_REGEXP: /^https?:/i,
  });

  // Refuerza los enlaces tras sanear: siempre nueva pestaña y rel seguro.
  const doc = new DOMParser().parseFromString(saneado, 'text/html');
  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('target', '_blank');
  });

  return doc.body.innerHTML;
}

export default function ContenidoEnriquecido({ children, className = '' }) {
  const contenido = children ?? '';
  if (contenido === '') return null;

  if (!TIENE_HTML.test(contenido)) {
    return <p className={`texto-plano ${className}`.trim()}>{contenido}</p>;
  }

  return (
    <div
      className={`contenido-enriquecido ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: limpiar(contenido) }}
    />
  );
}
