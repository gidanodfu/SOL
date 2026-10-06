// SPDX-License-Identifier: MIT
import { Check } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { Boton, Tarjeta } from '../../components/UI';
import { useToast } from '../../components/Feedbacks';
import { COLORES, MODOS, useTema } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../constants';

const ETIQUETA_COLOR = {
  blue: 'Azul', olive: 'Verde oliva', amber: 'Amarillo', obsidian: 'Obsidiana', red: 'Rojo',
};
const ETIQUETA_MODO = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' };

/**
 * Pantalla "Temas" (Configuración): apariencia, tipografía y accesibilidad. Cada
 * cambio se aplica de inmediato y se persiste para el usuario autenticado
 * (AuthContext → ui_preferences). Acceso por ruta dentro del AppShell.
 */
export default function Temas() {
  const { usuario, guardarPreferencias } = useAuth();
  const { color, modo, reducirAnimaciones, altoContraste } = useTema();
  const toast = useToast();
  const esAdmin = usuario?.rol === ROLES.ADMIN;

  const aplicar = async (prefs) => {
    try {
      await guardarPreferencias(prefs);
    } catch {
      toast.error('No se pudieron guardar las preferencias.');
    }
  };

  return (
    <div>
      {!esAdmin && (
        <PageHeader
          titulo="Temas"
          descripcion="Personaliza la apariencia de tu espacio de trabajo."
        />
      )}

      <div className="temas-grid">
        <Tarjeta titulo="Apariencia">
          <p className="tarjeta-sub">Personaliza los colores y el modo de visualización de SOL.</p>

          <h3 className="apariencia-titulo">Tema de color</h3>
          <div className="apariencia-temas">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                className={`apariencia-tema${color === c ? ' activo' : ''}`}
                onClick={() => aplicar({ theme: c })}
                aria-pressed={color === c}
              >
                <span className="apariencia-swatch" data-tema={c} aria-hidden="true" />
                <span className="apariencia-tema-nombre">{ETIQUETA_COLOR[c]}</span>
                {color === c && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>

          <h3 className="apariencia-titulo">Modo</h3>
          <div className="apariencia-modos">
            {MODOS.map((m) => (
              <button
                key={m}
                type="button"
                className={`apariencia-modo${modo === m ? ' activo' : ''}`}
                onClick={() => aplicar({ mode: m })}
                aria-pressed={modo === m}
              >
                {ETIQUETA_MODO[m]}
              </button>
            ))}
          </div>

          <div className="temas-acciones">
            <Boton
              variante="gris"
              onClick={() => aplicar({ theme: 'blue', mode: 'dark', reducedMotion: false, highContrast: false })}
            >
              Restablecer
            </Boton>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Tipografía">
          <p className="tarjeta-sub">Configura la tipografía utilizada por la interfaz.</p>

          <h3 className="apariencia-titulo">Fuente</h3>
          <div className="temas-fuente activo">
            <span className="temas-fuente-nombre">Predeterminada</span>
            <Check size={16} aria-hidden="true" />
          </div>
          <p className="tarjeta-sub temas-fuente-nota">
            Usa la tipografía predeterminada definida por SOL.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Accesibilidad">
          <p className="tarjeta-sub">Adapta la interfaz para facilitar su uso y mejorar la accesibilidad.</p>

          <div className="pref-lista">
            <button
              type="button"
              role="switch"
              aria-checked={reducirAnimaciones}
              className={`pref-opcion${reducirAnimaciones ? ' activo' : ''}`}
              onClick={() => aplicar({ reducedMotion: !reducirAnimaciones })}
            >
              <span className="pref-cuerpo">
                <span className="pref-titulo">Reducir animaciones</span>
                <span className="pref-desc">Reduce transiciones y efectos.</span>
              </span>
              <span className="pref-switch" aria-hidden="true" />
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={altoContraste}
              className={`pref-opcion${altoContraste ? ' activo' : ''}`}
              onClick={() => aplicar({ highContrast: !altoContraste })}
            >
              <span className="pref-cuerpo">
                <span className="pref-titulo">Mayor contraste</span>
                <span className="pref-desc">Refuerza la diferencia entre texto, fondos y controles.</span>
              </span>
              <span className="pref-switch" aria-hidden="true" />
            </button>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
