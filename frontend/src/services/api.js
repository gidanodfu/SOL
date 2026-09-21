// SPDX-License-Identifier: MIT
import axios from 'axios';
import { API_URL } from '../constants';

const api = axios.create({ baseURL: `${API_URL}/api` });

const tokens = {
  acceso: () => localStorage.getItem('empleo_access_token'),
  refresh: () => localStorage.getItem('empleo_refresh_token'),
  guardar: (d) => {
    localStorage.setItem('empleo_access_token', d.access_token);
    localStorage.setItem('empleo_refresh_token', d.refresh_token);
  },
  limpiar: () => {
    localStorage.removeItem('empleo_access_token');
    localStorage.removeItem('empleo_refresh_token');
  },
};

api.interceptors.request.use((config) => {
  const t = tokens.acceso();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let renovando = null;

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const { config, response } = error;
    const esAutenticacion = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (response?.status === 401 && !esAutenticacion && !config?._renovado && tokens.refresh()) {
      config._renovado = true;
      renovando ??= axios
        .post(`${API_URL}/api/auth/refresh`, { refresh_token: tokens.refresh() })
        .then((r) => {
          tokens.guardar(r.data.data);
          return r.data.data.access_token;
        })
        .catch(() => null)
        .finally(() => {
          renovando = null;
        });

      const nuevo = await renovando;
      if (nuevo) {
        config.headers.Authorization = `Bearer ${nuevo}`;
        return api(config);
      }
    }

    if (response?.status === 401) {
      tokens.limpiar();
      if (!esAutenticacion) window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

export default api;

export const guardarSesion = (d) => tokens.guardar(d);
export const limpiarSesion = () => tokens.limpiar();
export const hayToken = () => Boolean(tokens.acceso());
