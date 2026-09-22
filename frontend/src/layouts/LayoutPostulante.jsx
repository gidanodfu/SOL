// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, IdCard, LayoutDashboard, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import { perfilPostulante } from '../services/postulante';
import { useClickFuera } from '../hooks/useClickFuera';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';

const NAV = [
  { to: '/postulante/buscar', icono: 'ti ti-search', texto: 'Buscar empleo', corto: 'Buscar' },
  { to: '/postulante/oportunidades', icono: 'ti ti-building-store', texto: 'Ferias y oportunidades', corto: 'Ferias' },
  { to: '/postulante/postulaciones', icono: 'ti ti-file-check', texto: 'Mis postulaciones', corto: 'Postulaciones' },
];

const MENU = [
  { to: '/postulante/dashboard', icono: LayoutDashboard, texto: 'Dashboard' },
  { to: '/postulante/perfil', icono: IdCard, texto: 'Mi perfil y CV' },
  { to: '/postulante/cuenta', icono: UserCircle, texto: 'Mi cuenta' },
];

export function LayoutPostulante() {
  const { usuario } = useAuth();
  const { data: perfil } = useQuery({ queryKey: ['perfil-postulante'], queryFn: perfilPostulante });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const bloqueRef = useRef(null);

  useClickFuera(bloqueRef, menuAbierto, () => setMenuAbierto(false));

  const nombres = perfil?.nombres || usuario?.nombres || 'Postulante';
  const quien = (nombres || '').split(/\s+/)[0] || 'Postulante';
  const inicial = (quien[0] || 'P').toUpperCase();

  return (
    <div className="app-postulante">
      <header className="post-header">
        <Link to="/postulante/dashboard" className="brand">
          <div className="brand-mark">
            {logoError ? 'EM' : <img src={LOGO_URL} alt="Logo MDJLO" onError={() => setLogoError(true)} />}
          </div>
          <div className="brand-text">
            <div className="name">Empleo MDJLO</div>
            <div className="tag1">Sistema de intermediación laboral</div>
          </div>
        </Link>

        <nav className="post-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <i className={item.icono} />
              <span className="nav-text-full">{item.texto}</span>
              <span className="nav-text-short">{item.corto}</span>
            </NavLink>
          ))}
        </nav>

        <div ref={bloqueRef} className="user-menu">
          <button
            type="button"
            className="user-block"
            onClick={() => setMenuAbierto(!menuAbierto)}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            aria-label={`Menú de ${quien}`}
          >
            <span className="user-info">
              <span className="who">{quien}</span>
              <span className="role">Postulante</span>
            </span>
            <span className="avatar">{inicial}</span>
            <span className="user-chevron" aria-hidden="true">
              {menuAbierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          <div className={`user-dropdown${menuAbierto ? ' open' : ''}`} role="menu">
            {MENU.map((item) => (
              <Link key={item.to} to={item.to} role="menuitem" onClick={() => setMenuAbierto(false)}>
                <item.icono size={17} aria-hidden="true" />
                {item.texto}
              </Link>
            ))}
            <div className="divider" />
            <BotonSalir className="logout-item" />
          </div>
        </div>
      </header>

      <main className="post-main">
        <Outlet />
      </main>
    </div>
  );
}
