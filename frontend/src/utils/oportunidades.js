// SPDX-License-Identifier: MIT

/**
 * Una oportunidad es visible en el portal si el backend la marca como pública
 * y su ciclo de vida no es terminal. `programado` es un estado válido: una
 * oportunidad con inicio futuro puede ser visible y no debe descartarse.
 */
export const esOportunidadVisible = (oportunidad) => {
  if (!oportunidad || oportunidad.es_visible_publicamente === false) return false;

  return !['finalizado', 'cancelado'].includes(
    oportunidad.estado_efectivo || oportunidad.estado,
  );
};
