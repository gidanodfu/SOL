// SPDX-License-Identifier: MIT
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BotonSalir from '../components/BotonSalir';
import BotonTema from '../components/BotonTema';
import { ROLES, rutaPanel } from '../constants';
import { Cargando } from '../routes/Guardas';
import { LayoutPostulante } from './LayoutPostulante';
import { NavbarPostulante } from './NavbarPostulante';

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
      <NavbarPostulante className={usuario ? '' : 'publica'}>
        <div className={`cabecero-publico${usuario ? '' : ' publicas'}`}>
          <BotonTema />

          {usuario ? (
            <div className="guest-actions">
              <span className="guest-saludo">
                {usuario.nombres || 'Usuario'}
              </span>
              <Link to={rutaPanel(usuario.rol)} className="guest-link solid">
                <i className="ti ti-layout-grid" /> Mi panel
              </Link>
              <BotonSalir className="guest-link" />
            </div>
          ) : (
            <div className="guest-actions publicas">
              <Link to="/registro-empresa" className="guest-link guest-empresa" title="Registro de empresa">
                Soy una empresa
              </Link>
              <Link to="/login" className="guest-link guest-login solid">
                Iniciar sesión
              </Link>
              <Link to="/registro" className="guest-link guest-registro solid">
                Registrarme
              </Link>
            </div>
          )}
        </div>
      </NavbarPostulante>

      <main className="post-main">
        <Outlet />
      </main>
    </div>
  );
}
