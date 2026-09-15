import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  cambiarContrasena as apiContrasena,
  login as apiLogin,
  loginGoogle as apiLoginGoogle,
  logout as apiLogout,
  registroPostulante as apiRegistroPostulante,
  sesion,
} from '../services/auth';
import { guardarSesion, hayToken, limpiarSesion } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      if (hayToken()) {
        try {
          setUsuario(await sesion());
        } catch {
          limpiarSesion();
        }
      }
      setCargando(false);
    })();
  }, []);

  // Las funciones de acceso devuelven el objeto completo de la sesión
  // ({ access_token, refresh_token, usuario, ... }) para que las páginas puedan
  // decidir la redirección (p. ej. perfil incompleto tras Google).

  const login = useCallback(async (username, password) => {
    const datos = await apiLogin(username, password);
    guardarSesion(datos);
    setUsuario(datos.usuario);
    return datos;
  }, []);

  const loginGoogle = useCallback(async (idToken) => {
    const datos = await apiLoginGoogle(idToken);
    guardarSesion(datos);
    setUsuario(datos.usuario);
    return datos;
  }, []);

  // Registro de postulante: la cuenta se crea con sesión iniciada (auto-login).
  const registrarPostulante = useCallback(async (datos) => {
    const respuesta = await apiRegistroPostulante(datos);
    guardarSesion(respuesta);
    setUsuario(respuesta.usuario);
    return respuesta;
  }, []);

  // Único cierre de sesión: revoca en el backend, limpia los tokens y el estado
  // global, y recarga en /login (evita que el botón "Atrás" reabra páginas privadas
  // con estado en memoria).
  const logout = useCallback(async () => {
    await apiLogout();
    limpiarSesion();
    setUsuario(null);
    window.location.replace('/login');
  }, []);

  const refrescarUsuario = useCallback(async () => {
    setUsuario(await sesion());
  }, []);

  const cambiarContrasena = useCallback(async (datos) => {
    await apiContrasena(datos);
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, login, loginGoogle, registrarPostulante, logout, refrescarUsuario, cambiarContrasena }),
    [usuario, cargando, login, loginGoogle, registrarPostulante, logout, refrescarUsuario, cambiarContrasena],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return ctx;
}
