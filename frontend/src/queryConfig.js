// SPDX-License-Identifier: MIT

/**
 * Ventanas de frescura por tipo de dato. Las mutaciones siempre invalidan sus
 * claves, por lo que estos valores solo evitan repeticiones al remontar.
 *
 * - operativo: ofertas, postulaciones, contrataciones, solicitudes, usuarios,
 *   empresas, actividades, oportunidades e indicadores pendientes.
 * - dashboard: agregados que cambian con menos frecuencia.
 * - perfil: datos propios que solo cambian por una mutación del usuario.
 * - catalogo: categorías, prácticamente estáticas.
 */
export const STALE = {
  operativo: 15_000,
  dashboard: 30_000,
  perfil: 60_000,
  catalogo: 30 * 60_000,
};
