// SPDX-License-Identifier: MIT

/**
 * Utilidades puras de enlaces, sin dependencias del DOM ni de configuración de
 * Vite. Se reutilizan desde `utils.js` y se pueden probar con Node directamente.
 */

/** Solo http(s). Evita href ejecutables (`javascript:`, `data:`, `file:`). */
export const esEnlaceSeguro = (url) => {
  try {
    const { protocol } = new URL(String(url));
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * URLs http(s) escritas como texto plano. Devuelve la URL limpia (sin la
 * puntuación final habitual), su índice y la longitud del fragmento original
 * para poder reconstruir el texto con enlaces Intercalados.
 */
export const enlacesEnTexto = (texto) => {
  const patron = /\bhttps?:\/\/[^\s<>"')]+/gi;
  const encontrados = [];
  let coincidencia;

  while ((coincidencia = patron.exec(String(texto ?? ''))) !== null) {
    const url = coincidencia[0].replace(/[.,;:!?)\]]+$/, '');
    if (!esEnlaceSeguro(url)) continue;
    encontrados.push({
      url,
      indice: coincidencia.index,
      longitud: coincidencia[0].length,
    });
  }

  return encontrados;
};
