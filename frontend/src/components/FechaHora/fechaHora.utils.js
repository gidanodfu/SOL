// SPDX-License-Identifier: MIT

/**
 * Conversiones entre las cadenas que viajan a la API (`YYYY-MM-DD` y
 * `YYYY-MM-DDTHH:mm`) y los objetos Date que consume react-datepicker.
 *
 * Las fechas se construyen y descomponen con los componentes locales del
 * navegador. No se usa `toISOString()` ni se convierte a UTC: el valor es una
 * fecha de calendario/hora local de America/Lima y debe conservar el día y la
 * hora exactamente como los envió el backend.
 */

export const MODOS = ['fecha', 'fecha-hora'];

const RE_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?$/;

const dosDigitos = (valor) => String(valor).padStart(2, '0');

/**
 * Convierte una cadena de la API en Date local. Devuelve null si está vacía o
 * si no representa una fecha real (por ejemplo 2026-02-31).
 */
export function parseFechaHora(valor, modo = 'fecha') {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  const coincidencia = RE_FECHA_HORA.exec(texto);
  if (!coincidencia) return null;

  const [, anio, mes, dia, hora = '00', minuto = '00'] = coincidencia;
  const fecha = new Date(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    modo === 'fecha-hora' ? Number(hora) : 0,
    modo === 'fecha-hora' ? Number(minuto) : 0,
    0,
    0,
  );

  if (
    fecha.getFullYear() !== Number(anio)
    || fecha.getMonth() !== Number(mes) - 1
    || fecha.getDate() !== Number(dia)
    || (modo === 'fecha-hora' && (fecha.getHours() !== Number(hora) || fecha.getMinutes() !== Number(minuto)))
  ) {
    return null;
  }

  return fecha;
}

/** Convierte el Date local de react-datepicker a la cadena que espera la API. */
export function formatearFechaHora(fecha, modo = 'fecha') {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';

  const anio = fecha.getFullYear();
  const mes = dosDigitos(fecha.getMonth() + 1);
  const dia = dosDigitos(fecha.getDate());
  const base = `${anio}-${mes}-${dia}`;

  return modo === 'fecha-hora'
    ? `${base}T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
    : base;
}

/** Devuelve true cuando la cadena respeta el formato y es una fecha real. */
export function esFechaHoraValida(valor, modo = 'fecha') {
  return parseFechaHora(valor, modo) !== null;
}

/**
 * Límites para react-datepicker. En modo fecha el máximo incluye el día
 * completo; en fecha-hora se respeta la hora exacta recibida.
 */
export function limitesFechaHora(min, max, modo = 'fecha') {
  const minimo = parseFechaHora(min, modo);
  const maximo = parseFechaHora(max, modo);

  if (maximo && modo === 'fecha') {
    maximo.setHours(23, 59, 59, 999);
  }

  return { minDate: minimo, maxDate: maximo };
}
