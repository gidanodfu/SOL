// SPDX-License-Identifier: MIT
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Botón único de cierre de sesión. Usa el mismo handler global (AuthContext.logout)
 * y la misma iconografía (Lucide). Cada layout lo coloca en su bloque de usuario.
 */
export default function BotonSalir({ className = 'logout' }) {
  const { logout } = useAuth();

  return (
    <button className={className} type="button" onClick={logout}>
      <LogOut size={16} aria-hidden="true" />
      <span>Salir</span>
    </button>
  );
}
