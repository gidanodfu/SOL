// SPDX-License-Identifier: MIT
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import { useSidebarColapsado } from '../hooks/useSidebarColapsado';
import { perfilEmpresa } from '../services/empresas';

const GRUPOS = [
  {
    titulo: 'Empresa',
    items: [
      { to: '/empresa/dashboard', icono: LayoutDashboard, texto: 'Panel' },
      { to: '/empresa/ofertas', icono: Briefcase, texto: 'Ofertas' },
      { to: '/empresa/postulaciones', icono: FileCheck2, texto: 'Postulaciones' },
      { to: '/empresa/contrataciones', icono: ClipboardCheck, texto: 'Contrataciones' },
      { to: '/empresa/perfil', icono: Building2, texto: 'Mi empresa' },
      { to: '/empresa/cuenta', icono: UserCircle, texto: 'Mi cuenta' },
    ],
  },
];

const MARCA = {
  to: '/empresa/dashboard',
  iniciales: 'EM',
  nombre: 'Empleo MDJLO',
  tag: 'Sistema de intermediación laboral',
};

export function LayoutEmpresa() {
  const { usuario } = useAuth();
  const { data: perfil } = useQuery({ queryKey: ['perfil-empresa'], queryFn: perfilEmpresa });
  const { colapsado, alternar } = useSidebarColapsado();
  const nombre = perfil?.nombre_comercial || perfil?.razon_social || usuario?.nombres || 'Empresa';

  return (
    <div className={`app-empresa${colapsado ? ' colapsado' : ''}`}>
      <Sidebar
        marca={MARCA}
        grupos={GRUPOS}
        usuario={{ nombre, rol: 'Empresa', respaldo: 'EM' }}
        colapsado={colapsado}
        onToggle={alternar}
      />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
