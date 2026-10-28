// SPDX-License-Identifier: MIT
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Cargando, RutaProtegida, RutaPublica } from './Guardas';
import { LayoutApp } from '../layouts/AppLayout';
import { LayoutBusqueda } from '../layouts/LayoutBusqueda';
import { useAuth } from '../context/AuthContext';
import { ROLES, rutaPanel } from '../constants';

import Login from '../pages/auth/Login';
import Registro from '../pages/auth/Registro';
import RegistroEmpresa from '../pages/auth/RegistroEmpresa';
import ActivarCuenta from '../pages/auth/ActivarCuenta';
import DashboardAdmin from '../pages/admin/Dashboard';
import UsuariosAdmin from '../pages/admin/Usuarios';
import EmpresasAdmin from '../pages/admin/Empresas';
import SolicitudesEmpresaAdmin from '../pages/admin/SolicitudesEmpresa';
import OfertasAdmin from '../pages/admin/Ofertas';
import ActividadesAdmin from '../pages/admin/Actividades';
import OportunidadesAdmin from '../pages/admin/Oportunidades';
import ContratacionesAdmin from '../pages/admin/Contrataciones';
import DashboardEmpresa from '../pages/empresa/Dashboard';
import PerfilEmpresa from '../pages/empresa/Perfil';
import OfertasEmpresa from '../pages/empresa/Ofertas';
import PostulacionesEmpresa from '../pages/empresa/Postulaciones';
import ContratacionesEmpresa from '../pages/empresa/Contrataciones';
import PerfilPostulante from '../pages/postulante/Perfil';
import BuscarEmpleo from '../pages/postulante/BuscarEmpleo';
import MisPostulaciones from '../pages/postulante/MisPostulaciones';
import OportunidadesPostulante from '../pages/postulante/Oportunidades';
import Cuenta from '../pages/cuenta/Cuenta';
import Temas from '../pages/configuracion/Temas';
import PoliticaPrivacidad from '../pages/legal/PoliticaPrivacidad';
import TerminosCondiciones from '../pages/legal/TerminosCondiciones';
import AvisoLegal from '../pages/legal/AvisoLegal';
import PoliticaTecnologiasWeb from '../pages/legal/PoliticaTecnologiasWeb';

export function Rutas() {
  return (
    <Routes>
      {/* La raíz es pública: resuelve visitante o panel según la sesión ya
          restaurada por AuthContext. Nunca depende del hostname. */}
      <Route path="/" element={<Inicio />} />

      <Route path="/login" element={<RutaPublica><Login /></RutaPublica>} />
      <Route path="/registro" element={<RutaPublica><Registro /></RutaPublica>} />
      <Route path="/registro-empresa" element={<RegistroEmpresa />} />
      <Route path="/activar-cuenta/:token" element={<ActivarCuenta />} />

      {/* Documentos legales públicos: no dependen de la sesión ni redirigen a login. */}
      <Route path="/politica-privacidad" element={<PoliticaPrivacidad />} />
      <Route path="/terminos-condiciones" element={<TerminosCondiciones />} />
      <Route path="/aviso-legal" element={<AvisoLegal />} />
      <Route path="/politica-cookies" element={<PoliticaTecnologiasWeb />} />

      {/* Bolsa de empleo pública: se ve sin sesión. Para postulantes autenticados
          se conserva el cabecero de postulante (LayoutBusqueda decide). */}
      <Route element={<LayoutBusqueda />}>
        <Route path="postulante/buscar" element={<BuscarEmpleo />} />
        <Route path="postulante/oportunidades" element={<OportunidadesPostulante />} />
      </Route>

      <Route
        element={
          <RutaProtegida>
            <LayoutApp />
          </RutaProtegida>
        }
      >
        <Route element={<RutaProtegida roles={[ROLES.ADMIN]}><Outlet /></RutaProtegida>}>
          <Route path="admin/dashboard" element={<DashboardAdmin />} />
          <Route path="admin/usuarios" element={<RutaProtegida perfil="admin"><UsuariosAdmin /></RutaProtegida>} />
          <Route path="admin/empresas" element={<EmpresasAdmin />} />
          <Route path="admin/solicitudes-empresa" element={<SolicitudesEmpresaAdmin />} />
          <Route path="admin/ofertas" element={<OfertasAdmin />} />
          <Route path="admin/actividades" element={<ActividadesAdmin />} />
          <Route path="admin/oportunidades" element={<OportunidadesAdmin />} />
          <Route path="admin/contrataciones" element={<ContratacionesAdmin />} />
        </Route>

        <Route element={<RutaProtegida roles={[ROLES.EMPRESA]}><Outlet /></RutaProtegida>}>
          <Route path="empresa/dashboard" element={<DashboardEmpresa />} />
          <Route path="empresa/perfil" element={<PerfilEmpresa />} />
          <Route path="empresa/ofertas" element={<OfertasEmpresa />} />
          <Route path="empresa/postulaciones" element={<PostulacionesEmpresa />} />
          <Route path="empresa/contrataciones" element={<ContratacionesEmpresa />} />
          <Route path="empresa/cuenta" element={<Cuenta />} />
        </Route>

        <Route element={<RutaProtegida roles={[ROLES.POSTULANTE]}><Outlet /></RutaProtegida>}>
          {/* El dashboard del postulante se migró a "Mi perfil y CV"; se conserva la
              ruta como redirección para no romper enlaces ni favoritos antiguos. */}
          <Route path="postulante/dashboard" element={<Navigate to="/postulante/perfil" replace />} />
          <Route path="postulante/postulaciones" element={<MisPostulaciones />} />
          <Route path="postulante/perfil" element={<PerfilPostulante />} />
          <Route path="postulante/cuenta" element={<Cuenta />} />
        </Route>

        {/* Configuración de apariencia: disponible para los paneles con selector
            de temas (Administrador, Empresa y Postulante). */}
        <Route element={<RutaProtegida roles={[ROLES.ADMIN, ROLES.EMPRESA, ROLES.POSTULANTE]}><Outlet /></RutaProtegida>}>
          <Route path="configuracion/temas" element={<Temas />} />
        </Route>

        <Route path="cuenta" element={<Cuenta />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Inicio() {
  const { usuario, cargando } = useAuth();

  // La sesión se está restaurando (incluido el refresh): no redirigir todavía.
  if (cargando) return <Cargando />;

  // Sin sesión válida, o con un rol no reconocido, se continúa como visitante.
  return <Navigate to={rutaPanel(usuario?.rol)} replace />;
}
