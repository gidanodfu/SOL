// SPDX-License-Identifier: MIT
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CLAVE = 'sol-tema';
const CLARO = 'claro';
const OSCURO = 'oscuro';

const ThemeContext = createContext(null);

/** Preferencia guardada; por defecto claro (comportamiento original). */
function temaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === CLARO || guardado === OSCURO) return guardado;
  } catch {
    // Sin persistencia (modo privado): se usa el valor por defecto.
  }
  return CLARO;
}

/**
 * Fuente única del tema de la aplicación. Aplica el tema al documento
 * (`data-theme`) y lo persiste; los layouts y componentes solo consumen
 * `useTema()` y las variables CSS, sin duplicar lógica.
 */
export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    // El estado/persistencia usa `claro|oscuro`, pero el DOM y `color-scheme`
    // requieren los valores estándar `light|dark` (el CSS selecciona
    // `[data-theme="dark"]` y `color-scheme` solo acepta dark/light).
    const modoDom = tema === OSCURO ? 'dark' : 'light';
    const raiz = document.documentElement;
    raiz.dataset.theme = modoDom;
    raiz.style.colorScheme = modoDom;
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      // Sin persistencia: el tema sigue funcionando en memoria.
    }
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((previo) => (previo === OSCURO ? CLARO : OSCURO));
  }, []);

  const valor = useMemo(() => ({ tema, alternarTema }), [tema, alternarTema]);

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de ThemeProvider.');
  return ctx;
}
