// SPDX-License-Identifier: MIT
import api from './api';

export const listarActividadesAdmin = (params = {}) => api.get('/admin/actividades', { params }).then((r) => r.data.data);
export const crearActividad = (datos) => api.post('/admin/actividades', datos).then((r) => r.data.data);
export const actualizarActividad = (id, datos) => api.put(`/admin/actividades/${id}`, datos).then((r) => r.data.data);
export const cambiarEstadoActividad = (id, estado) => api.put(`/admin/actividades/${id}/estado`, { estado }).then((r) => r.data.data);

export const subirImagenActividad = (id, archivo) => {
  const form = new FormData();
  form.append('imagen', archivo);
  return api.post(`/admin/actividades/${id}/imagen`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);
};
export const eliminarImagenActividad = (id) => api.delete(`/admin/actividades/${id}/imagen`).then((r) => r.data.data);

export const listarOportunidadesAdmin = (params = {}) => api.get('/admin/oportunidades', { params }).then((r) => r.data.data);
export const crearOportunidad = (datos) => api.post('/admin/oportunidades', datos).then((r) => r.data.data);
export const actualizarOportunidad = (id, datos) => api.put(`/admin/oportunidades/${id}`, datos).then((r) => r.data.data);
export const cambiarActivacionOportunidad = (id, activo) => api.put(`/admin/oportunidades/${id}/activacion`, { activo }).then((r) => r.data.data);

/* Difusión visible para cualquier rol autenticado (RF-48) */
export const listarActividadesPublicas = () => api.get('/actividades').then((r) => r.data.data);
export const listarOportunidadesPublicas = () => api.get('/oportunidades').then((r) => r.data.data);
