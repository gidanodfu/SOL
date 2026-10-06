// SPDX-License-Identifier: MIT
import api from './api';

export const login = (username, password, turnstileToken) => {
  const cuerpo = { username, password };
  if (turnstileToken) cuerpo.turnstile_token = turnstileToken;
  return api.post('/auth/login', cuerpo).then((r) => r.data.data);
};
export const loginGoogle = (idToken) => api.post('/auth/google', { id_token: idToken }).then((r) => r.data.data);
export const sesion = () => api.get('/auth/me').then((r) => r.data.data);
export const logout = () => api.post('/auth/logout').catch(() => {});
export const registroPostulante = (datos) => api.post('/registro/postulante', datos).then((r) => r.data.data);
export const cambiarContrasena = (datos) => api.put('/cuenta/contrasena', datos).then((r) => r.data.data);
