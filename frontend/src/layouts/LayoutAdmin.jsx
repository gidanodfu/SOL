// SPDX-License-Identifier: MIT
import { Outlet, useLocation } from 'react-router-dom';
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
import Sidebar from '../components/Sidebar';
import { useSidebarColapsado } from '../hooks/useSidebarColapsado';

const GRUPOS = [
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

const MARCA = {
  to: '/admin/dashboard',
  iniciales: 'AD',
  nombre: 'Empleo MDJLO',
  tag: 'Sistema de intermediación laboral',
};

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

export function LayoutAdmin() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  const { colapsado, alternar } = useSidebarColapsado();

  const ruta = Object.keys(TITULO_POR_RUTA)
    .sort((a, b) => b.length - a.length)
    .find((r) => pathname.startsWith(r));
  const [titulo, subtitulo] = TITULO_POR_RUTA[ruta] || ['Panel administrativo', 'Gestión del empleo'];

  const nombre = `${usuario?.nombres || ''} ${usuario?.apellidos || ''}`.trim() || 'Administrador';

  return (
    <div className={`app-admin${colapsado ? ' colapsado' : ''}`}>
      <Sidebar
        marca={MARCA}
        grupos={GRUPOS}
        usuario={{ nombre, rol: 'Municipalidad', respaldo: 'AD' }}
        colapsado={colapsado}
        onToggle={alternar}
      />

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
