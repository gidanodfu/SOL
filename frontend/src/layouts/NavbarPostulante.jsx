// SPDX-License-Identifier: MIT
import { Link, NavLink } from 'react-router-dom';
import { CalendarDays, House } from 'lucide-react';
import BuscadorNavbar from '../components/BuscadorNavbar';
import LogoMunicipal from '../components/LogoMunicipal';

const NAV = [
  { to: '/postulante/buscar', Icono: House, texto: 'Inicio', corto: 'Inicio' },
  { to: '/postulante/oportunidades', Icono: CalendarDays, texto: 'Ferias y oportunidades', corto: 'Ferias' },
  { to: '/postulante/postulaciones', icono: 'ti ti-file-check', texto: 'Mis postulaciones', corto: 'Postulaciones' },
];

/**
 * Cabecera del portal del postulante, compartida por el visitante y el usuario
 * autenticado. Estructura única en una sola fila:
 * logo + identidad · buscador · navegación · acciones.
 * Las acciones (visitante o menú de usuario) se inyectan como children, de modo
 * que ambas variantes comparten la composición y el buscador sin mezclar los
 * flujos de autenticación.
 */
export function NavbarPostulante({ children, className = '' }) {
  return (
    <header className={`post-header${className ? ` ${className}` : ''}`}>
      <Link to="/postulante/buscar" className="brand" aria-label="Empleo MDJLO — sistema de intermediación laboral">
        <span className="brand-mark">
          <LogoMunicipal decorative />
        </span>
        <span className="brand-text">
          <span className="name">Empleo MDJLO</span>
          <span className="tag1">Sistema de intermediación laboral</span>
        </span>
      </Link>

      <BuscadorNavbar />

      <nav className="post-nav">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.Icono ? <item.Icono aria-hidden="true" /> : <i className={item.icono} />}
            <span className="nav-text-full">{item.texto}</span>
            <span className="nav-text-short">{item.corto}</span>
          </NavLink>
        ))}
      </nav>

      <div className="post-acciones">{children}</div>
    </header>
  );
}
