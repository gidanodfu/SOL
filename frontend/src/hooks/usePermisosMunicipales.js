// SPDX-License-Identifier: MIT
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Permisos municipales de la sesión. La lista viene del backend en
 * `usuario.permisos_municipales`; este hook no define una matriz paralela.
 *
 * `puede('usuarios')` oculta/ muestra controles, pero el backend vuelve a
 * validar cada operación con `AutorizacionMunicipalService` y el filtro
 * `permiso`.
 */
export function usePermisosMunicipales() {
  const { usuario } = useAuth();
  const permisos = useMemo(
    () => new Set(Array.isArray(usuario?.permisos_municipales) ? usuario.permisos_municipales : []),
    [usuario],
  );

  const perfil = usuario?.perfil_municipal || null;

  return {
    perfil,
    permisos,
    esAdmin: perfil === 'admin',
    esModerador: perfil === 'moderador',
    esSoloLectura: perfil === 'solo_lectura',
    puede: (permiso) => permisos.has(permiso),
  };
}
