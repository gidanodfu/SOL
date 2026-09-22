// SPDX-License-Identifier: MIT
import api from './api';

export const reportesAdmin = (params = {}) => api.get('/admin/reportes', { params }).then((r) => r.data.data);
export const listarContratacionesAdmin = (params = {}) => api.get('/admin/contrataciones', { params }).then((r) => r.data.data);

export const listarContratacionesEmpresa = (params = {}) => api.get('/empresa/contrataciones', { params }).then((r) => r.data.data);
export const opcionesContratacionEmpresa = () => api.get('/empresa/contrataciones/opciones').then((r) => r.data.data);
export const registrarContratacion = (datos) => api.post('/empresa/contrataciones', datos).then((r) => r.data.data);
export const actualizarContratacion = (id, datos) => api.put(`/empresa/contrataciones/${id}`, datos).then((r) => r.data.data);
