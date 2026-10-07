// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import BotonSalir from './BotonSalir';

/**
 * Sidebar compartido por admin y empresa: misma estructura, estilos y
 * comportamiento. La navegación la define cada rol (no se mezclan opciones).
 * Iconografía Lucide. En escritorio se contrae a un carril de iconos con
 * tooltip; en móvil (≤860px) se abre como drawer superpuesto.
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

export default function Sidebar({ marca, grupos, usuario, colapsado, onToggle, indicadores = {} }) {
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const etiquetaToggle = colapsado ? 'Expandir menú' : 'Contraer menú';

  return (
    <>
      <header className="side-movil-bar">
        <button
          type="button"
          className="side-movil-burger"
          onClick={() => setAbiertoMovil(true)}
          title="Abrir menú"
          aria-label="Abrir menú"
          aria-expanded={abiertoMovil}
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <Link to={marca.to} className="side-movil-marca" onClick={() => setAbiertoMovil(false)}>
          <span className="side-movil-mark">{marca.iniciales}</span>
          <span className="side-movil-nombre">{marca.nombre}</span>
        </Link>

        <button
          type="button"
          className="side-movil-user"
          onClick={() => setAbiertoMovil(true)}
          title="Abrir menú de usuario"
          aria-label="Abrir menú de usuario"
        >
          {iniciales(usuario?.nombre, usuario?.respaldo)}
        </button>
      </header>

      <button
        type="button"
        className="side-movil-btn"
        onClick={() => setAbiertoMovil(true)}
        title="Abrir menú"
        aria-label="Abrir menú"
        aria-expanded={abiertoMovil}
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {abiertoMovil && <div className="side-backdrop" onClick={() => setAbiertoMovil(false)} aria-hidden="true" />}

      <aside className={`sidebar${colapsado ? ' colapsado' : ''}${abiertoMovil ? ' abierto' : ''}`}>
        <header className="side-cabecera">
          <Link to={marca.to} className="side-brand" title={marca.nombre} onClick={() => setAbiertoMovil(false)}>
            <span className="brand-mark">{marca.iniciales}</span>
            <span className="brand-text">
              <span className="name">{marca.nombre}</span>
              <span className="tag">{marca.tag}</span>
            </span>
          </Link>

          <button
            type="button"
            className="side-toggle-icono side-colapsar"
            onClick={onToggle}
            title={etiquetaToggle}
            aria-label={etiquetaToggle}
            aria-expanded={!colapsado}
          >
            {colapsado ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
          </button>

          <button
            type="button"
            className="side-toggle-icono side-cerrar-movil"
            onClick={() => setAbiertoMovil(false)}
            title="Cerrar menú"
            aria-label="Cerrar menú"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="side-nav">
          {grupos.map((grupo) => (
            <div className="side-group" key={grupo.titulo || 'principal'}>
              {grupo.titulo && <div className="side-group-title">{grupo.titulo}</div>}
              {grupo.items.map((item) => (
                item.onClick ? (
                  <button
                    key={item.texto}
                    type="button"
                    className="side-link"
                    data-tooltip={colapsado ? item.texto : undefined}
                    aria-label={item.texto}
                    onClick={() => { item.onClick(); setAbiertoMovil(false); }}
                  >
                    <item.icono size={18} strokeWidth={2} aria-hidden="true" />
                    <span className="side-link-text">{item.texto}</span>
                  </button>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    data-tooltip={colapsado ? item.texto : undefined}
                    aria-label={item.texto}
                    onClick={() => setAbiertoMovil(false)}
                    className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
                  >
                    <item.icono size={18} strokeWidth={2} aria-hidden="true" />
                    <span className="side-link-text">{item.texto}</span>
                    {indicadores[item.to] ? (
                      <span className="side-punto" role="status" aria-label={`${item.texto}: tiene pendientes`} />
                    ) : null}
                  </NavLink>
                )
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
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
    </>
  );
}
