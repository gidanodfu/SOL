// SPDX-License-Identifier: MIT
import api from './api';

export const dashboardAdmin = (params = {}) => api.get('/admin/dashboard', { params }).then((r) => r.data.data);
export const dashboardPostulante = () => api.get('/postulante/dashboard').then((r) => r.data.data);

export const perfilPostulante = () => api.get('/postulante/perfil').then((r) => r.data.data);
export const actualizarPerfilPostulante = (datos) => api.put('/postulante/perfil', datos).then((r) => r.data.data);

export const cvActual = () => api.get('/postulante/cv').then((r) => r.data.data);
export const subirCv = (archivo) => {
  const form = new FormData();
  form.append('cv', archivo);
  return api.post('/postulante/cv', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);
};
export const urlCv = () => api.get('/postulante/cv/descargar').then((r) => r.data.data);

/* Búsqueda de empleo pública (RF-27..RF-29): las ofertas y su detalle se pueden
   consultar sin sesión; al estar autenticado el detalle informa "ya_postule". */
export const listarOfertas = (params = {}) => api.get('/ofertas', { params }).then((r) => r.data.data);
export const detalleOferta = (id) => api.get(`/ofertas/${id}`).then((r) => r.data.data);

/* Postulaciones (RF-30..RF-32) */
export const listarMisPostulaciones = () => api.get('/postulante/postulaciones').then((r) => r.data.data);
export const postular = (ofertaId) => api.post('/postulante/postulaciones', { oferta_id: ofertaId }).then((r) => r.data.data);
export const retirarPostulacion = (id) => api.put(`/postulante/postulaciones/${id}/retirar`).then((r) => r.data.data);

/* CRUD de secciones del perfil (RF-19/20) */
export const crearSeccion = (seccion, datos) => api.post(`/postulante/perfil/${seccion}`, datos).then((r) => r.data.data);
export const actualizarSeccion = (seccion, id, datos) => api.put(`/postulante/perfil/${seccion}/${id}`, datos).then((r) => r.data.data);
export const eliminarSeccion = (seccion, id) => api.delete(`/postulante/perfil/${seccion}/${id}`).then((r) => r.data.data);
