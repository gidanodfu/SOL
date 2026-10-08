// SPDX-License-Identifier: MIT
import DOMPurify from 'dompurify';
import { esEnlaceSeguro } from '../utils';

/**
 * Render seguro de contenido enriquecido (RTE) o de texto plano heredado.
 *
 * - El backend sanitiza al persistir (autoridad); aquí se aplica DOMPurify como
 *   defensa en profundidad antes de pintar.
 * - Si el contenido no tiene HTML permitido (datos antiguos), se muestra como
 *   texto plano conservando los saltos de línea.
 * - Autolink: las URLs http(s) escritas como texto (dentro de párrafos o en
 *   registros antiguos) se convierten en enlaces clicables. No re-enlaza texto
 *   que ya está dentro de un <a>. Solo http/https (javascript:/data: se ignoran).
 */
const TAGS_PERMITIDOS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a'];
const ATRIBUTOS_PERMITIDOS = ['href', 'target', 'rel'];
const TIENE_HTML = /<(p|br|strong|b|em|i|u|ul|ol|li|a)(\s|>|\/)/i;

// Detección estricta de URL (la validación de protocolo la hace esEnlaceSeguro).
const URL_TEST = /\bhttps?:\/\/[^\s<>"')]+/i;
const URL_GLOBAL = /\bhttps?:\/\/[^\s<>"')]+/gi;

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Recorta puntuación final que suele no formar parte de la URL. */
function limpiarUrl(url) {
  return url.replace(/[.,;:!?)\]]+$/, '');
}

/** Convierte en enlaces las URLs http(s) de los nodos de texto (no dentro de <a>). */
function enlazarNodos(doc) {
  const recorrido = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (nodo) => {
      if (!nodo.nodeValue || !URL_TEST.test(nodo.nodeValue)) return NodeFilter.FILTER_REJECT;
      if (nodo.parentElement && nodo.parentElement.closest('a')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodos = [];
  while (recorrido.nextNode()) nodos.push(recorrido.currentNode);

  nodos.forEach((nodo) => {
    const texto = nodo.nodeValue;
    URL_GLOBAL.lastIndex = 0;
    const fragmento = doc.createDocumentFragment();
    let ultimo = 0;
    let coincidencia;
    let hubo = false;

    while ((coincidencia = URL_GLOBAL.exec(texto)) !== null) {
      const url = limpiarUrl(coincidencia[0]);
      if (!esEnlaceSeguro(url)) continue;
      hubo = true;
      if (coincidencia.index > ultimo) {
        fragmento.appendChild(doc.createTextNode(texto.slice(ultimo, coincidencia.index)));
      }
      const a = doc.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.textContent = url;
      fragmento.appendChild(a);
      ultimo = coincidencia.index + coincidencia[0].length;
    }

    if (hubo) {
      if (ultimo < texto.length) fragmento.appendChild(doc.createTextNode(texto.slice(ultimo)));
      nodo.parentNode.replaceChild(fragmento, nodo);
    }
  });
}

function limpiar(html) {
  const saneado = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAGS_PERMITIDOS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    ALLOWED_URI_REGEXP: /^https?:/i,
  });

  const doc = new DOMParser().parseFromString(saneado, 'text/html');

  // Refuerza los enlaces ya existentes: nueva pestaña + rel seguro.
  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('target', '_blank');
  });

  // Convierte en enlaces las URLs escritas como texto (sin tocar las ya enlazadas).
  enlazarNodos(doc);

  return doc.body.innerHTML;
}

export default function ContenidoEnriquecido({ children, className = '' }) {
  const contenido = children ?? '';
  if (contenido === '') return null;

  const esHtml = TIENE_HTML.test(contenido);
  const html = esHtml
    ? contenido
    : `<p>${escapar(contenido).replace(/\n/g, '<br>')}</p>`;

  return (
    <div
      className={`contenido-enriquecido ${esHtml ? '' : 'texto-plano'} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: limpiar(html) }}
    />
  );
}
