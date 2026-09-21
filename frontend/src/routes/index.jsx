// SPDX-License-Identifier: MIT
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RutaProtegida, RutaPublica } from './Guardas';
import { LayoutApp } from '../layouts/AppLayout';
import { LayoutBusqueda } from '../layouts/LayoutBusqueda';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../constants';

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
import DashboardPostulante from '../pages/postulante/Dashboard';
import PerfilPostulante from '../pages/postulante/Perfil';
import BuscarEmpleo from '../pages/postulante/BuscarEmpleo';
import MisPostulaciones from '../pages/postulante/MisPostulaciones';
import OportunidadesPostulante from '../pages/postulante/Oportunidades';
import Cuenta from '../pages/cuenta/Cuenta';

export function Rutas() {
  return (
    <Routes>
      <Route path="/login" element={<RutaPublica><Login /></RutaPublica>} />
      <Route path="/registro" element={<RutaPublica><Registro /></RutaPublica>} />
      <Route path="/registro-empresa" element={<RegistroEmpresa />} />
      <Route path="/activar-cuenta/:token" element={<ActivarCuenta />} />

      {/* Bolsa de empleo pública: se ve sin sesión. Para postulantes autenticados
          se conserva el cabecero de postulante (LayoutBusqueda decide). */}
      <Route element={<LayoutBusqueda />}>
        <Route path="postulante/buscar" element={<BuscarEmpleo />} />
        <Route path="postulante/oportunidades" element={<OportunidadesPostulante />} />
      </Route>

      <Route
        path="/"
        element={
          <RutaProtegida>
            <LayoutApp />
          </RutaProtegida>
        }
      >
        <Route index element={<Inicio />} />

        <Route element={<RutaProtegida roles={[ROLES.ADMIN]}><Outlet /></RutaProtegida>}>
          <Route path="admin/dashboard" element={<DashboardAdmin />} />
          <Route path="admin/usuarios" element={<UsuariosAdmin />} />
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
          <Route path="postulante/dashboard" element={<DashboardPostulante />} />
          <Route path="postulante/postulaciones" element={<MisPostulaciones />} />
          <Route path="postulante/perfil" element={<PerfilPostulante />} />
          <Route path="postulante/cuenta" element={<Cuenta />} />
        </Route>

        <Route path="cuenta" element={<Cuenta />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Inicio() {
  const { usuario } = useAuth();
  const destino = { admin: '/admin/dashboard', empresa: '/empresa/dashboard', postulante: '/postulante/buscar' };
  return <Navigate to={destino[usuario?.rol] || '/login'} replace />;
}
