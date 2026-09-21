// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';

/**
 * Cierra un menú/panel cuando se hace clic fuera de la referencia dada.
 * `activo` controla si el listener está registrado.
 */
export function useClickFuera(ref, activo, alCerrar) {
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => {
    alCerrarRef.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (!activo) return undefined;
    const manejar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) alCerrarRef.current();
    };
    document.addEventListener('mousedown', manejar);
    return () => document.removeEventListener('mousedown', manejar);
  }, [ref, activo]);
}
