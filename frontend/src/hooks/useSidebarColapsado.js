// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

const CLAVE = 'sol-sidebar-colapsado';

/**
 * Estado del sidebar contraíble con persistencia en localStorage. En pantallas
 * pequeñas inicia contraído para no restar espacio al contenido.
 */
export function useSidebarColapsado() {
  const [colapsado, setColapsado] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado !== null) return guardado === '1';
    } catch {
      // Preferencia no disponible (modo privado): se usa el valor por defecto.
    }

    return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  });

  const alternar = useCallback(() => {
    setColapsado((previo) => {
      const siguiente = !previo;
      try {
        localStorage.setItem(CLAVE, siguiente ? '1' : '0');
      } catch {
        // Sin persistencia: el estado sigue funcionando en memoria.
      }

      return siguiente;
    });
  }, []);

  return { colapsado, alternar };
}
