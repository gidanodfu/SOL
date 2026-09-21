// SPDX-License-Identifier: MIT
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import { perfilEmpresa } from '../services/empresas';

const ENLACES = [
  { to: '/empresa/dashboard', icono: 'ti ti-layout-grid', texto: 'Panel' },
  { to: '/empresa/ofertas', icono: 'ti ti-briefcase', texto: 'Ofertas' },
  { to: '/empresa/postulaciones', icono: 'ti ti-file-check', texto: 'Postulaciones' },
  { to: '/empresa/contrataciones', icono: 'ti ti-checklist', texto: 'Contrataciones' },
  { to: '/empresa/perfil', icono: 'ti ti-building', texto: 'Mi empresa' },
  { to: '/empresa/cuenta', icono: 'ti ti-user-circle', texto: 'Mi cuenta' },
];

function iniciales(nombre = '') {
  const siglas = (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] || '')
    .join('');
  return (siglas || 'EM').toUpperCase();
}

export function LayoutEmpresa() {
  const { usuario } = useAuth();
  const { data: perfil } = useQuery({ queryKey: ['perfil-empresa'], queryFn: perfilEmpresa });
  const nombre = perfil?.nombre_comercial || perfil?.razon_social || usuario?.nombres || 'Empresa';

  return (
    <div className="app-empresa">
      <aside className="sidebar">
        <Link to="/empresa/dashboard" className="brand">
          <div className="brand-mark">EM</div>
          <div className="brand-text">
            <div className="name">Empleo MDJLO</div>
            <div className="tag">Sistema de intermediación laboral</div>
          </div>
        </Link>

        <div className="nav-label">Empresa</div>
        <nav>
          {ENLACES.map((enlace) => (
            <NavLink key={enlace.to} to={enlace.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <i className={enlace.icono} />
              {enlace.texto}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="side-user">
            <div className="avatar">{iniciales(nombre)}</div>
            <div>
              <div className="who">{nombre}</div>
              <div className="role">Empresa</div>
            </div>
          </div>
          <BotonSalir />
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
