import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Megaphone,
  UserCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';

const MENU = [
  {
    titulo: 'Principal',
    items: [
      { to: '/admin/dashboard', icono: LayoutDashboard, texto: 'Dashboard' },
      { to: '/admin/ofertas', icono: Briefcase, texto: 'Ofertas' },
      { to: '/admin/actividades', icono: CalendarDays, texto: 'Actividades' },
      { to: '/admin/oportunidades', icono: Megaphone, texto: 'Difusión' },
    ],
  },
  {
    titulo: 'Gestión',
    items: [
      { to: '/admin/contrataciones', icono: FileCheck2, texto: 'Contratos' },
      { to: '/admin/usuarios', icono: Users, texto: 'Usuarios' },
      { to: '/admin/empresas', icono: Building2, texto: 'Empresas' },
      { to: '/admin/solicitudes-empresa', icono: ClipboardList, texto: 'Solicitudes' },
      { to: '/cuenta', icono: UserCircle, texto: 'Mi cuenta' },
    ],
  },
];

const TITULO_POR_RUTA = {
  '/admin/dashboard': ['Dashboard', 'Resumen general de la gestión de empleo'],
  '/admin/ofertas': ['Ofertas', 'Supervisión de ofertas laborales'],
  '/admin/actividades': ['Actividades', 'Ferias, eventos, talleres y capacitaciones'],
  '/admin/oportunidades': ['Difusión', 'Oportunidades laborales y de emprendimiento'],
  '/admin/contrataciones': ['Contratos', 'Contrataciones registradas'],
  '/admin/usuarios': ['Usuarios', 'Cuentas del sistema'],
  '/admin/empresas': ['Empresas', 'Empresas afiliadas'],
  '/admin/solicitudes-empresa': ['Solicitudes', 'Solicitudes de afiliación de empresas'],
  '/cuenta': ['Mi cuenta', 'Tu cuenta y contraseña'],
};

function iniciales(nombre = '') {
  const siglas = (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] || '')
    .join('');
  return (siglas || 'AD').toUpperCase();
}

export function LayoutAdmin() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();

  const ruta = Object.keys(TITULO_POR_RUTA)
    .sort((a, b) => b.length - a.length)
    .find((r) => pathname.startsWith(r));
  const [titulo, subtitulo] = TITULO_POR_RUTA[ruta] || ['Panel administrativo', 'Gestión del empleo'];

  const nombre = `${usuario?.nombres || ''} ${usuario?.apellidos || ''}`.trim() || 'Administrador';

  return (
    <div className="app-admin">
      <aside className="sidebar">
        <div className="brand">
          <h1>Empleo MDJLO</h1>
          <span>Sistema de intermediación laboral</span>
        </div>

        <nav className="menu">
          {MENU.map((grupo) => (
            <div key={grupo.titulo} style={{ marginBottom: 20 }}>
              <div className="menu-title">{grupo.titulo}</div>
              {grupo.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
                >
                  <item.icono size={18} strokeWidth={2} />
                  <span>{item.texto}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box">
            <div className="avatar">{iniciales(nombre)}</div>
            <div className="user-info">
              <strong>{nombre}</strong>
              <span>Municipalidad</span>
            </div>
          </div>
          <BotonSalir />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-title">
            <h2>{titulo}</h2>
            <p>{subtitulo}</p>
          </div>

        </header>

        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
