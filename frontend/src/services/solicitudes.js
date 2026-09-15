import api from './api';

/* Flujo público: auto-registro de empresa */
export const verificarRuc = (ruc) => api.post('/verificar-ruc', { ruc }).then((r) => r.data.data);
export const enviarSolicitudEmpresa = (datos) => api.post('/solicitudes-empresa', datos).then((r) => r.data.data);

/* Activación de cuenta de empresa mediante enlace de un solo uso */
export const verActivacion = (token) => api.get(`/activar-cuenta/${token}`).then((r) => r.data.data);
export const activarCuenta = (token, datos) => api.post(`/activar-cuenta/${token}`, datos).then((r) => r.data.data);

/* Bandeja municipal: aprobar/rechazar y regenerar el enlace de activación */
export const listarSolicitudesEmpresa = (params = {}) => api.get('/admin/solicitudes-empresa', { params }).then((r) => r.data.data);
export const aprobarSolicitudEmpresa = (id) => api.post(`/admin/solicitudes-empresa/${id}/aprobar`).then((r) => r.data.data);
export const rechazarSolicitudEmpresa = (id, motivo) => api.post(`/admin/solicitudes-empresa/${id}/rechazar`, { motivo }).then((r) => r.data.data);
export const generarEnlaceSolicitud = (id) => api.get(`/admin/solicitudes-empresa/${id}/enlace`).then((r) => r.data.data);
