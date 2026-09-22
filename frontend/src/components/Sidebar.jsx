// SPDX-License-Identifier: MIT
import { Link, NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import BotonSalir from './BotonSalir';

/**
 * Sidebar compartido por admin y empresa: misma estructura, estilos y
 * comportamiento. La navegación la define cada rol (no se mezclan opciones).
 * Iconografía con Lucide Icons y modo contraído con tooltip/aria-label.
 */
function iniciales(nombre = '', respaldo = 'US') {
  const siglas = (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] || '')
    .join('');

  return (siglas || respaldo).toUpperCase();
}

export default function Sidebar({ marca, grupos, usuario, colapsado, onToggle }) {
  const etiquetaToggle = colapsado ? 'Expandir menú' : 'Contraer menú';

  return (
    <aside className={`sidebar${colapsado ? ' colapsado' : ''}`}>
      <Link to={marca.to} className="side-brand" title={marca.nombre}>
        <span className="brand-mark">{marca.iniciales}</span>
        <span className="brand-text">
          <span className="name">{marca.nombre}</span>
          <span className="tag">{marca.tag}</span>
        </span>
      </Link>

      <nav className="side-nav">
        {grupos.map((grupo) => (
          <div className="side-group" key={grupo.titulo || 'principal'}>
            {grupo.titulo && <div className="side-group-title">{grupo.titulo}</div>}
            {grupo.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={colapsado ? item.texto : undefined}
                aria-label={item.texto}
                className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
              >
                <item.icono size={18} strokeWidth={2} aria-hidden="true" />
                <span className="side-link-text">{item.texto}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <button
          type="button"
          className="side-toggle"
          onClick={onToggle}
          title={etiquetaToggle}
          aria-label={etiquetaToggle}
          aria-expanded={!colapsado}
        >
          {colapsado ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          <span className="side-toggle-text">Contraer menú</span>
        </button>

        <div className="side-user">
          <span className="side-avatar">{iniciales(usuario?.nombre, usuario?.respaldo)}</span>
          <span className="side-user-info">
            <strong title={usuario?.nombre}>{usuario?.nombre}</strong>
            <small>{usuario?.rol}</small>
          </span>
        </div>

        <BotonSalir />
      </div>
    </aside>
  );
}
