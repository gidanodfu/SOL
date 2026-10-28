// SPDX-License-Identifier: MIT
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Cargando() {
  return <div className="cargando">Cargando…</div>;
}

export function RutaProtegida({ roles = null, perfil = null, children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  if (perfil && usuario.perfil_municipal !== perfil) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

export function RutaPublica({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <Cargando />;
  if (usuario) return <Navigate to="/" replace />;
  return children;
}
