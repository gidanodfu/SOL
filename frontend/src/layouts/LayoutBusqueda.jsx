// SPDX-License-Identifier: MIT
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import BotonTema from '../components/BotonTema';
import { ROLES } from '../constants';
import { Cargando } from '../routes/Guardas';
import { LayoutPostulante } from './LayoutPostulante';
import { NavbarPostulante } from './NavbarPostulante';

const panelPorRol = { [ROLES.ADMIN]: '/admin/dashboard', [ROLES.EMPRESA]: '/empresa/dashboard', [ROLES.POSTULANTE]: '/postulante/perfil' };

/**
 * Rutas públicas de bolsa de empleo: /postulante/buscar y /postulante/oportunidades
 * se pueden ver sin iniciar sesión. Si quien navega es un postulante autenticado se
 * muestra el mismo cabecero de postulante; en caso contrario un cabecero público con
 * acceso a iniciar sesión o registrarse. Ambas variantes comparten NavbarPostulante.
 */
export function LayoutBusqueda() {
  const { usuario, cargando } = useAuth();

  if (cargando) return <Cargando />;

  if (usuario?.rol === ROLES.POSTULANTE) return <LayoutPostulante />;

  return <CabeceroPublico usuario={usuario} />;
}

function CabeceroPublico({ usuario }) {
  return (
    <div className="app-postulante">
      <NavbarPostulante>
        <BotonTema />

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
      </NavbarPostulante>

      <main className="post-main">
        <Outlet />
      </main>
    </div>
  );
}
