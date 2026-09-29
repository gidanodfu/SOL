// SPDX-License-Identifier: MIT
import { Moon, Sun } from 'lucide-react';
import { useTema } from '../context/ThemeContext';

/**
 * Cambio entre modo claro y oscuro. La lógica vive en ThemeContext; este
 * componente solo se monta donde corresponde (sidebar y cabeceras).
 * `variante="header"` para las cabeceras con fondo azul marino.
 */
export default function BotonTema({ variante = 'sidebar' }) {
  const { tema, alternarTema } = useTema();
  const oscuro = tema === 'oscuro';
  const etiqueta = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      className={variante === 'header' ? 'btn-tema' : 'side-toggle side-toggle-tema'}
      onClick={alternarTema}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={oscuro}
    >
      {oscuro ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      {variante === 'sidebar' && <span className="side-toggle-text">{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  );
}
