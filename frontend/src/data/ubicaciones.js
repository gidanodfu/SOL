// SPDX-License-Identifier: MIT

/**
 * Catálogo canónico de ubicaciones de las ofertas laborales.
 *
 * Es la única fuente del frontend: la usan el filtro público de búsqueda y el
 * selector del formulario de ofertas de empresa. Los valores se guardan tal
 * cual en `ofertas.ubicacion` y el backend valida la misma lista.
 */
export const UBICACIONES_OFERTA = Object.freeze([
  'Chiclayo',
  'José Leonardo Ortiz',
  'La Victoria',
  'Pimentel',
  'Lambayeque',
]);
