import api from './api';

export const listarUsuarios = (params = {}) => api.get('/admin/usuarios', { params }).then((r) => r.data.data);
export const obtenerUsuario = (id) => api.get(`/admin/usuarios/${id}`).then((r) => r.data.data);
export const crearUsuario = (datos) => api.post('/admin/usuarios', datos).then((r) => r.data.data);
export const actualizarUsuario = (id, datos) => api.put(`/admin/usuarios/${id}`, datos).then((r) => r.data.data);
export const cambiarEstadoUsuario = (id, estado) => api.put(`/admin/usuarios/${id}/estado`, { estado }).then((r) => r.data.data);
export const resetPasswordUsuario = (id, password) => api.put(`/admin/usuarios/${id}/password`, { password }).then((r) => r.data.data);
