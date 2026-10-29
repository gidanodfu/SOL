// SPDX-License-Identifier: MIT
import { API_URL } from './constants';

export const errorApi = (e) => {
  const data = e?.response?.data;
  const mensaje = typeof data === 'object' && data !== null ? data.message : null;
  if (mensaje) return mensaje;
  if (e?.response?.status === 429) return 'Demasiadas solicitudes. Intente nuevamente en unos minutos.';
  if (e?.response?.status >= 500) return 'El servidor no está disponible en este momento. Intente más tarde.';
  if (e?.message === 'Network Error') return 'No se pudo conectar con el servidor. Verifique su conexión.';
  return 'Ocurrió un error inesperado. Intente nuevamente.';
};

/**
 * Error de una descarga binaria. Axios entrega el JSON de la API como Blob
 * cuando se usa responseType: 'blob'; se lee para conservar el mensaje 422.
 */
export async function errorApiDescarga(e, mensajePorDefecto = 'No se pudo generar el archivo.') {
  const data = e?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const json = JSON.parse(await data.text());
      if (json?.message) return json.message;
    } catch {
      // El cuerpo no era JSON: se usa el mensaje genérico de errorApi.
    }
  }
  const mensaje = errorApi(e);
  return mensaje === 'Ocurrió un error inesperado. Intente nuevamente.' ? mensajePorDefecto : mensaje;
}

/** Descarga un Blob ya recibido. Rechaza respuestas vacías. */
export function descargarBlob(blob, nombreArchivo) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob) || blob.size === 0) {
    throw new Error('El archivo descargado está vacío.');
  }

  const enlace = document.createElement('a');
  const url = URL.createObjectURL(blob);
  enlace.href = url;
  enlace.download = nombreArchivo || 'reporte';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Reglas de formato compartidas; viven en un módulo sin dependencias para
 * poder probarse de forma aislada. */
export { soloDigitos, esTelefonoValido, esEmailValido } from './utils/validacionCampos.js';

/**
 * Enlaces de usuario: solo http(s). Evita que una URL manipulada (javascript:,
 * data:) se convierta en un href ejecutable (el backend también lo valida).
 */
export const esEnlaceSeguro = (url) => {
  try {
    const { protocol } = new URL(String(url));
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * El host de la URL debe ser uno de los dominios indicados o un subdominio
 * legítimo suyo (comparación sobre el host real, no sobre el texto). Evita
 * aceptar "instagram.com.ejemplo.com" como Instagram.
 */
export const dominioPermitido = (url, dominios) => {
  if (!esEnlaceSeguro(url)) return false;
  let host = '';
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return false; }
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
};

/* ---------- Texto enriquecido (RTE) ---------- */

export const TEXTO_MAX = 10000;
export const TEXTO_AVISO = 9000;

/**
 * Medición canónica del texto VISIBLE (sin etiquetas HTML), en caracteres
 * (code points Unicode, igual que PHP mb_strlen) y palabras. Es la misma
 * definición que aplica el backend (`Validador::longitudTexto`), de modo que
 * el frontend no permite lo que el backend rechazaría.
 */
export const medirTexto = (texto) => {
  const t = String(texto ?? '');
  const limpio = t.trim();
  return {
    caracteres: [...t].length,
    palabras: limpio ? limpio.split(/\s+/).length : 0,
  };
};

/**
 * Texto visible de un contenido enriquecido: extrae el texto de las etiquetas
 * (misma definición conceptual que `Validador::textoVisible` en el backend).
 */
export const textoVisible = (html) => {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  return doc.body.textContent || '';
};

/** Medición de un contenido enriquecido (sobre su texto visible). */
export const medirTextoEnriquecido = (html) => medirTexto(textoVisible(html));

/** true si el texto visible supera el límite vigente (10.000 por defecto). */
export const excedeLimiteTexto = (html, max = TEXTO_MAX) => medirTextoEnriquecido(html).caracteres > max;

/**
 * true si un contenido enriquecido no tiene texto significativo: "", espacios,
 * "<p></p>" o "<p><br></p>". Usa el mismo criterio que `HtmlSanitizer::limpiar`
 * del backend (texto visible sin etiquetas, comparado tras trim), de modo que el
 * frontend no permite lo que el backend rechazaría.
 */
export const textoEnriquecidoVacio = (html) => textoVisible(html).trim() === '';

export const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');
export const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

/**
 * URL absoluta de un recurso servido por la API a partir de la ruta relativa que
 * esta devuelve (p. ej. la imagen pública de una actividad).
 */
export const urlArchivo = (ruta) => (ruta ? `${API_URL}${ruta}` : null);

/**
 * Fecha calendario (columnas MySQL DATE: `YYYY-MM-DD`). Se formatea por texto,
 * sin `new Date(...)`, para que la zona horaria del navegador no desplace el día.
 * También acepta `YYYY-MM-DD HH:MM:SS` (toma solo la fecha).
 */
export const fechaCalendario = (v) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return coincidencia ? `${coincidencia[3]}/${coincidencia[2]}/${coincidencia[1]}` : '—';
};

/** Fecha de hoy en America/Lima, en formato MySQL DATE (`YYYY-MM-DD`). */
export const fechaHoyLima = () => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
};

/** true si el valor es una fecha calendárica real en formato `YYYY-MM-DD`. */
export const esFechaCalendario = (valor) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? ''));
  if (!coincidencia) return false;

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return fecha.getUTCFullYear() === anio
    && fecha.getUTCMonth() === mes - 1
    && fecha.getUTCDate() === dia;
};

export const iniciar = (nombre) => (nombre ? nombre.split(' ').slice(0, 2).join(' ') : '');

/**
 * Descarga una URL firmada del CV. Si apunta al propio backend (driver local),
 * la solicitud incluye el token para pasar la autorización (RT-CV-04/05).
 */
export async function descargarUrl(url, nombreArchivo) {
  let interna = false;
  try {
    interna = new URL(url).origin === new URL(API_URL).origin;
  } catch {
    interna = false;
  }

  if (!interna) {
    window.open(url, '_blank');
    return;
  }

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem('empleo_access_token')}` },
  });
  if (!resp.ok) throw new Error('No se pudo descargar el archivo.');
  const blob = await resp.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo || 'cv.pdf';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}
