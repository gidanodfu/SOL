// SPDX-License-Identifier: MIT
import api from './api';

/* Contexto empresa: sus propias ofertas */
export const listarOfertasEmpresa = () => api.get('/empresa/ofertas').then((r) => r.data.data);
export const detalleOfertaEmpresa = (id) => api.get(`/empresa/ofertas/${id}`).then((r) => r.data.data);
export const crearOferta = (datos) => api.post('/empresa/ofertas', datos).then((r) => r.data.data);
export const actualizarOferta = (id, datos) => api.put(`/empresa/ofertas/${id}`, datos).then((r) => r.data.data);
export const enviarOfertaARevision = (id) => api.put(`/empresa/ofertas/${id}/enviar-revision`).then((r) => r.data.data);
export const cerrarOferta = (id) => api.put(`/empresa/ofertas/${id}/cerrar`).then((r) => r.data.data);

/* Contexto municipal: revisión y supervisión */
export const listarOfertasAdmin = (params = {}) => api.get('/admin/ofertas', { params }).then((r) => r.data.data);
export const detalleOfertaAdmin = (id) => api.get(`/admin/ofertas/${id}`).then((r) => r.data.data);
export const aprobarOfertaAdmin = (id) => api.put(`/admin/ofertas/${id}/aprobar`).then((r) => r.data.data);
export const rechazarOfertaAdmin = (id, motivo) => api.put(`/admin/ofertas/${id}/rechazar`, { motivo }).then((r) => r.data.data);
export const cerrarOfertaAdmin = (id) => api.put(`/admin/ofertas/${id}/cerrar`).then((r) => r.data.data);
