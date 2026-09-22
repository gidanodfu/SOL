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

/** El backend valida 9 u 11 dígitos; el frontend usa el mismo criterio. */
export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
export const esTelefonoValido = (v) => v == null || v === '' || /^(?:\d{9}|\d{11})$/.test(String(v));

export const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');
export const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

/**
 * Fecha calendario (columnas MySQL DATE: `YYYY-MM-DD`). Se formatea por texto,
 * sin `new Date(...)`, para que la zona horaria del navegador no desplace el día.
 * También acepta `YYYY-MM-DD HH:MM:SS` (toma solo la fecha).
 */
export const fechaCalendario = (v) => {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return coincidencia ? `${coincidencia[3]}/${coincidencia[2]}/${coincidencia[1]}` : '—';
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
