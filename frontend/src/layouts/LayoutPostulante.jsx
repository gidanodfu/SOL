// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, IdCard, Info, Palette, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import ProfileImage from '../components/ProfileImage';
import { perfilPostulante } from '../services/postulante';
import { useClickFuera } from '../hooks/useClickFuera';
import { urlArchivo } from '../utils';
import { NavbarPostulante } from './NavbarPostulante';

const MENU = [
  { to: '/postulante/perfil', icono: IdCard, texto: 'Mi perfil y CV' },
  { to: '/configuracion/temas', icono: Palette, texto: 'Temas' },
  { to: '/postulante/cuenta', icono: UserCircle, texto: 'Mi cuenta' },
];

export function LayoutPostulante() {
  const { usuario } = useAuth();
  const { data: perfil } = useQuery({ queryKey: ['perfil-postulante'], queryFn: perfilPostulante });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const bloqueRef = useRef(null);

  useClickFuera(bloqueRef, menuAbierto, () => setMenuAbierto(false));

  const nombres = perfil?.nombres || usuario?.nombres || 'Postulante';
  const quien = (nombres || '').split(/\s+/)[0] || 'Postulante';

  return (
    <div className="app-postulante">
      <NavbarPostulante>
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
            <ProfileImage
              className="user-avatar"
              src={urlArchivo(perfil?.foto_url)}
              nombre={quien}
              alt={`Foto de perfil de ${quien}`}
              size={36}
            />
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
            <NavLink
              to="/about"
              role="menuitem"
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Info size={17} aria-hidden="true" />
              Acerca de
            </NavLink>
            <div className="divider" />
            <BotonSalir className="logout-item" />
          </div>
        </div>
      </NavbarPostulante>

      <main className="post-main">
        <Outlet />
      </main>
    </div>
  );
}
