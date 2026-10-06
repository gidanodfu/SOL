// SPDX-License-Identifier: MIT
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const COLORES = ['blue', 'olive', 'amber', 'obsidian', 'red'];
export const MODOS = ['light', 'dark', 'system'];
export const FUENTES = ['default'];

export const PREFERENCIAS_DEFECTO = {
  theme: 'blue', mode: 'dark', font: 'default', reducedMotion: false, highContrast: false,
};

function prefiereOscuro() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const ThemeContext = createContext(null);

/**
 * Fuente única del estado visual de la aplicación: identidad cromática, modo y
 * accesibilidad (reducción de animaciones y alto contraste). Aplica `data-tema`,
 * `data-theme`, `data-contrast` y `data-motion` al documento.
 *
 * La preferencia del usuario NO se guarda aquí: vive en el backend
 * (`ui_preferences`) y `AuthContext` la hidrata al iniciar sesión. Este contexto
 * solo mantiene el estado en memoria (arranque con valores por defecto) para no
 * filtrar la configuración de un usuario a otro. No usa localStorage.
 */
export function ThemeProvider({ children }) {
  const [color, setColor] = useState(PREFERENCIAS_DEFECTO.theme);
  const [modo, setModo] = useState(PREFERENCIAS_DEFECTO.mode);
  const [reducirAnimaciones, setReducirAnimaciones] = useState(PREFERENCIAS_DEFECTO.reducedMotion);
  const [altoContraste, setAltoContraste] = useState(PREFERENCIAS_DEFECTO.highContrast);
  const [fuente, setFuente] = useState(PREFERENCIAS_DEFECTO.font);
  const [sistemaOscuro, setSistemaOscuro] = useState(prefiereOscuro);

  const modoEfectivo = modo === 'system' ? (sistemaOscuro ? 'dark' : 'light') : modo;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const manejar = (e) => setSistemaOscuro(e.matches);
    mq.addEventListener('change', manejar);
    return () => mq.removeEventListener('change', manejar);
  }, []);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.tema = color;
    raiz.dataset.theme = modoEfectivo;
    raiz.style.colorScheme = modoEfectivo;
    if (altoContraste) raiz.dataset.contrast = 'high';
    else delete raiz.dataset.contrast;
    if (reducirAnimaciones) raiz.dataset.motion = 'reduced';
    else delete raiz.dataset.motion;
  }, [color, modoEfectivo, altoContraste, reducirAnimaciones]);

  const elegirColor = useCallback((nuevo) => {
    if (COLORES.includes(nuevo)) setColor(nuevo);
  }, []);

  const elegirModo = useCallback((nuevo) => {
    if (MODOS.includes(nuevo)) setModo(nuevo);
  }, []);

  // Aplica las preferencias recibidas (hidratación desde el backend). Admite
  // actualizaciones parciales: solo aplica las claves presentes.
  const setPreferencias = useCallback((p = {}) => {
    if (COLORES.includes(p.theme)) setColor(p.theme);
    if (MODOS.includes(p.mode)) setModo(p.mode);
    if (FUENTES.includes(p.font)) setFuente(p.font);
    if (typeof p.reducedMotion === 'boolean') setReducirAnimaciones(p.reducedMotion);
    if (typeof p.highContrast === 'boolean') setAltoContraste(p.highContrast);
  }, []);

  const restablecer = useCallback(() => {
    setColor(PREFERENCIAS_DEFECTO.theme);
    setModo(PREFERENCIAS_DEFECTO.mode);
    setReducirAnimaciones(PREFERENCIAS_DEFECTO.reducedMotion);
    setAltoContraste(PREFERENCIAS_DEFECTO.highContrast);
    setFuente(PREFERENCIAS_DEFECTO.font);
  }, []);

  const alternarModo = useCallback(() => {
    setModo(modoEfectivo === 'dark' ? 'light' : 'dark');
  }, [modoEfectivo]);

  const valor = useMemo(
    () => ({
      color, modo, modoEfectivo, reducirAnimaciones, altoContraste, fuente,
      elegirColor, elegirModo, setPreferencias, restablecer, alternarModo,
    }),
    [color, modo, modoEfectivo, reducirAnimaciones, altoContraste, fuente,
      elegirColor, elegirModo, setPreferencias, restablecer, alternarModo],
  );

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de ThemeProvider.');
  return ctx;
}
