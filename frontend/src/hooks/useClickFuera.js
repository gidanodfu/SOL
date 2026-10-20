// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';

/**
 * Cierra un menú/panel cuando se hace clic fuera de la referencia dada.
 * `activo` controla si el listener está registrado.
 */
export function useClickFuera(ref, activo, alCerrar, otrosRefs = []) {
  const alCerrarRef = useRef(alCerrar);
  const otrosRefsRef = useRef(otrosRefs);

  useEffect(() => {
    alCerrarRef.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    otrosRefsRef.current = otrosRefs;
  }, [otrosRefs]);

  useEffect(() => {
    if (!activo) return undefined;
    const manejar = (e) => {
      const dentro = [ref, ...otrosRefsRef.current].some(
        (actual) => actual.current && actual.current.contains(e.target),
      );
      if (!dentro) alCerrarRef.current();
    };
    document.addEventListener('mousedown', manejar);
    return () => document.removeEventListener('mousedown', manejar);
  }, [ref, activo]);
}
