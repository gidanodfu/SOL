import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import { ROLES } from '../constants';
import { Cargando } from '../routes/Guardas';
import { LayoutPostulante } from './LayoutPostulante';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1788530622409-c587704d-1068-43f2-b9e1-9b8ab867e021.jpeg';

const NAV = [
  { to: '/postulante/buscar', icono: 'ti ti-search', texto: 'Buscar empleo', corto: 'Buscar' },
  { to: '/postulante/oportunidades', icono: 'ti ti-building-store', texto: 'Ferias y oportunidades', corto: 'Ferias' },
];

const panelPorRol = { [ROLES.ADMIN]: '/admin/dashboard', [ROLES.EMPRESA]: '/empresa/dashboard', [ROLES.POSTULANTE]: '/postulante/dashboard' };

/**
 * Rutas públicas de bolsa de empleo: /postulante/buscar y /postulante/oportunidades
 * se pueden ver sin iniciar sesión. Si quien navega es un postulante autenticado se
 * muestra el mismo cabecero de postulante; en caso contrario un cabecero público con
 * acceso a iniciar sesión o registrarse.
 */
export function LayoutBusqueda() {
  const { usuario, cargando } = useAuth();

  if (cargando) return <Cargando />;

  if (usuario?.rol === ROLES.POSTULANTE) return <LayoutPostulante />;

  return <CabeceroPublico usuario={usuario} />;
}

function CabeceroPublico({ usuario }) {
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="app-postulante">
      <header className="post-header">
        <Link to="/postulante/buscar" className="brand">
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

        {usuario ? (
          <div className="guest-actions">
            <span className="guest-saludo">
              {usuario.nombres || 'Usuario'}
            </span>
            <Link to={panelPorRol[usuario.rol] || '/'} className="guest-link solid">
              <i className="ti ti-layout-grid" /> Mi panel
            </Link>
            <BotonSalir className="guest-link" />
          </div>
        ) : (
          <div className="guest-actions">
            <Link to="/registro-empresa" className="guest-link" title="Registro de empresa">
              Soy una empresa
            </Link>
            <Link to="/login" className="guest-link solid">
              Iniciar sesión
            </Link>
            <Link to="/registro" className="guest-link solid">
              Registrarme
            </Link>
          </div>
        )}
      </header>

      <main className="post-main">
        <Outlet />
      </main>
    </div>
  );
}
