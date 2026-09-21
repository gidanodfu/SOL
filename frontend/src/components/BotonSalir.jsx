// SPDX-License-Identifier: MIT
import { useAuth } from '../context/AuthContext';

/**
 * Botón único de cierre de sesión. Usa el mismo handler global (AuthContext.logout)
 * y el estilo de referencia del módulo Empresa (icono Tabler + "Salir").
 * Cada layout lo coloca en su bloque de usuario; no duplicar el botón.
 */
export default function BotonSalir({ className = 'logout' }) {
  const { logout } = useAuth();

  return (
    <button className={className} type="button" onClick={logout}>
      <i className="ti ti-logout-2" aria-hidden="true" />
      <span>Salir</span>
    </button>
  );
}
