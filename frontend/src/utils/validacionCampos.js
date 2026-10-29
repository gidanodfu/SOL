// SPDX-License-Identifier: MIT

/** Reglas de formato compartidas por formularios y validadores de UI. */

export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/** El backend valida 9 u 11 dígitos; el frontend usa el mismo criterio. */
export const esTelefonoValido = (v) => v == null || v === '' || /^(?:\d{9}|\d{11})$/.test(String(v));

/** Validación inmediata del formulario; el backend conserva la autoridad final. */
export const esEmailValido = (v) => {
  const email = String(v ?? '').trim();
  return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
