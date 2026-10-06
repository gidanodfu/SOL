// SPDX-License-Identifier: MIT
import { Moon, Sun } from 'lucide-react';
import { useTema } from '../context/ThemeContext';

/**
 * Cambio rápido entre modo claro y oscuro, usado en las cabeceras del portal
 * público/postulante. El modo de la aplicación (claro/oscuro/sistema) se elige
 * en el panel "Apariencia" (Configuración → Tema) en Admin y Empresa; este botón
 * sigue disponible como acceso directo en las cabeceras.
 */
export default function BotonTema() {
  const { modoEfectivo, alternarModo } = useTema();
  const oscuro = modoEfectivo === 'dark';
  const etiqueta = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      className="btn-tema"
      onClick={alternarModo}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={oscuro}
    >
      {oscuro ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
