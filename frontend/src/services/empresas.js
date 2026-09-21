// SPDX-License-Identifier: MIT
import api from './api';

export const listarEmpresas = (params = {}) => api.get('/admin/empresas', { params }).then((r) => r.data.data);
export const obtenerEmpresa = (id) => api.get(`/admin/empresas/${id}`).then((r) => r.data.data);
export const crearEmpresa = (datos) => api.post('/admin/empresas', datos).then((r) => r.data.data);
export const actualizarEmpresa = (id, datos) => api.put(`/admin/empresas/${id}`, datos).then((r) => r.data.data);
export const cambiarEstadoEmpresa = (id, estado) => api.put(`/admin/empresas/${id}/estado`, { estado }).then((r) => r.data.data);
export const resetPasswordEmpresa = (id, password) => api.put(`/admin/empresas/${id}/password`, { password }).then((r) => r.data.data);

export const perfilEmpresa = () => api.get('/empresa/perfil').then((r) => r.data.data);
export const actualizarPerfilEmpresa = (datos) => api.put('/empresa/perfil', datos).then((r) => r.data.data);
export const dashboardEmpresa = () => api.get('/empresa/dashboard').then((r) => r.data.data);

/* Bandeja de postulaciones (RF-33..RF-40) */
export const listarPostulacionesEmpresa = (params = {}) => api.get('/empresa/postulaciones', { params }).then((r) => r.data.data);
export const detallePostulacionEmpresa = (id) => api.get(`/empresa/postulaciones/${id}`).then((r) => r.data.data);
export const cambiarEstadoPostulacion = (id, estado) => api.put(`/empresa/postulaciones/${id}/estado`, { estado }).then((r) => r.data.data);
export const cambiarActivacionPostulacion = (id, activo) => api.put(`/empresa/postulaciones/${id}/activacion`, { activo }).then((r) => r.data.data);
export const urlCvPostulacion = (id) => api.get(`/empresa/postulaciones/${id}/cv`).then((r) => r.data.data);
