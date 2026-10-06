// SPDX-License-Identifier: MIT
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
import { guardarPreferenciasCuenta, preferenciasCuenta } from '../services/cuenta';
import { useTema } from './ThemeContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setPreferencias, restablecer } = useTema();
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Carga las preferencias del usuario autenticado (backend = fuente de verdad).
  const hidratarPreferencias = useCallback(async () => {
    try {
      setPreferencias(await preferenciasCuenta());
    } catch {
      // Usuario sin preferencias guardadas: se aplican los valores por defecto.
    }
  }, [setPreferencias]);

  useEffect(() => {
    (async () => {
      if (hayToken()) {
        try {
          setUsuario(await sesion());
          await hidratarPreferencias();
        } catch {
          limpiarSesion();
        }
      }
      setCargando(false);
    })();
  }, [hidratarPreferencias]);

  // Las funciones de acceso devuelven el objeto completo de la sesión
  // ({ access_token, refresh_token, usuario, ... }) para que las páginas puedan
  // decidir la redirección (p. ej. perfil incompleto tras Google).

  const login = useCallback(async (username, password, turnstileToken) => {
    const datos = await apiLogin(username, password, turnstileToken);
    guardarSesion(datos);
    setUsuario(datos.usuario);
    await hidratarPreferencias();
    return datos;
  }, [hidratarPreferencias]);

  const loginGoogle = useCallback(async (idToken) => {
    const datos = await apiLoginGoogle(idToken);
    guardarSesion(datos);
    setUsuario(datos.usuario);
    await hidratarPreferencias();
    return datos;
  }, [hidratarPreferencias]);

  // Registro de postulante: la cuenta se crea con sesión iniciada (auto-login).
  const registrarPostulante = useCallback(async (datos) => {
    const respuesta = await apiRegistroPostulante(datos);
    guardarSesion(respuesta);
    setUsuario(respuesta.usuario);
    await hidratarPreferencias();
    return respuesta;
  }, [hidratarPreferencias]);

  // Guarda las preferencias del usuario autenticado: aplica de inmediato (UI) y
  // persiste en el backend para ESE usuario (nunca en una configuración global).
  // Admite actualizaciones parciales (p. ej. solo el tema o solo el contraste).
  const guardarPreferencias = useCallback(async (prefs) => {
    setPreferencias(prefs);
    await guardarPreferenciasCuenta(prefs);
  }, [setPreferencias]);

  // Único cierre de sesión: revoca en el backend, limpia los tokens y el estado
  // (incluido el visual) y recarga en /login. No borra las preferencias en BD.
  const logout = useCallback(async () => {
    await apiLogout();
    limpiarSesion();
    setUsuario(null);
    restablecer();
    window.location.replace('/login');
  }, [restablecer]);

  const refrescarUsuario = useCallback(async () => {
    setUsuario(await sesion());
  }, []);

  const cambiarContrasena = useCallback(async (datos) => {
    await apiContrasena(datos);
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, login, loginGoogle, registrarPostulante, logout, refrescarUsuario, cambiarContrasena, guardarPreferencias }),
    [usuario, cargando, login, loginGoogle, registrarPostulante, logout, refrescarUsuario, cambiarContrasena, guardarPreferencias],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return ctx;
}
